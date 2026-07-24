import database from "../config/db.js";
import https from "https";
import { Resolver } from "dns/promises";

const OPENAI_HOST = "api.openai.com";
const OPENAI_RESPONSES_PATH = "/v1/responses";
const GEMINI_HOST = "generativelanguage.googleapis.com";
const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

function compactJson(value, limit = 22000) {
  const text = JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n...TRUNCATED` : text;
}

function safeText(value) {
  return String(value || "").trim();
}

function vietnamDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((map, part) => {
      map[part.type] = part.value;
      return map;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00+07:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value) {
  const [hours = 0, minutes = 0] = String(value || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

function isScheduleActiveNow(schedule, now) {
  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);

  if (start === end) return false;
  if (end > start) {
    return schedule.work_date === now.date && now.minutes >= start && now.minutes < end;
  }

  return (
    (schedule.work_date === now.date && now.minutes >= start) ||
    (addDays(schedule.work_date, 1) === now.date && now.minutes < end)
  );
}

function parseJsonObject(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function extractResponseText(payload) {
  if (payload?.output_text) return payload.output_text;

  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content?.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("");
}

function extractGeminiText(payload) {
  return (payload?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("");
}

async function queryOrEmpty(sql, params = []) {
  try {
    const [rows] = await database.query(sql, params);
    return rows || [];
  } catch (error) {
    console.warn("[ai.service] Optional query failed:", error.message);
    return [];
  }
}

async function lookupPublic(hostname) {
  try {
    const addresses = await resolver.resolve4(hostname);
    return addresses[0] || hostname;
  } catch {
    return hostname;
  }
}

async function postJson({ hostname, path, headers, body }) {
  const resolvedHost = await lookupPublic(hostname);
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: resolvedHost,
        servername: hostname,
        path,
        method: "POST",
        timeout: Number(process.env.AI_REQUEST_TIMEOUT_MS || 90000),
        headers: {
          Host: hostname,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: data,
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`${hostname} request timed out`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function postOpenAIJson(body) {
  return postJson({
    hostname: OPENAI_HOST,
    path: OPENAI_RESPONSES_PATH,
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body,
  });
}

async function postGeminiJson(body, modelName) {
  const model = modelName || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  return postJson({
    hostname: GEMINI_HOST,
    path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      process.env.GEMINI_API_KEY,
    )}`,
    headers: {},
    body,
  });
}

async function callOpenAI({ system, user, schema, fallback }) {
  const withFallbackMeta = (reason) => ({
    ...fallback,
    ai_status: "fallback",
    fallback_reason: reason,
  });

  if (!process.env.OPENAI_API_KEY) {
    return withFallbackMeta("missing_api_key");
  }

  try {
    const response = await postOpenAIJson({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schema.name,
          strict: true,
          schema: schema.schema,
        },
      },
    });

    if (!response.ok) {
      console.warn("[ai.service] OpenAI request failed:", response.status, response.text);
      return withFallbackMeta(`openai_http_${response.status}`);
    }

    const payload = JSON.parse(response.text);
    return parseJsonObject(extractResponseText(payload), fallback);
  } catch (error) {
    console.warn("[ai.service] OpenAI unavailable:", error.message);
    return withFallbackMeta("openai_unavailable");
  }
}

async function callGemini({ system, user, schema, fallback }) {
  const withFallbackMeta = (reason) => ({
    ...fallback,
    ai_status: "fallback",
    fallback_reason: reason,
  });

  if (!process.env.GEMINI_API_KEY) {
    return withFallbackMeta("missing_gemini_api_key");
  }

  try {
    const body = {
      systemInstruction: {
        parts: [{ text: system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: user }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schema.schema,
      },
    };
    const modelsToTry = [
      process.env.GEMINI_MODEL || "gemini-2.0-flash",
      process.env.GEMINI_FALLBACK_MODEL || "gemini-2.0-flash",
    ].filter((model, index, models) => model && models.indexOf(model) === index);

    let lastResponse = null;
    for (const model of modelsToTry) {
      const response = await postGeminiJson(body, model);
      lastResponse = response;

      if (response.ok) {
        const payload = JSON.parse(response.text);
        const parsed = parseJsonObject(extractGeminiText(payload), fallback);
        return {
          ...parsed,
          ai_status: "ok",
          ai_provider: "gemini",
          ai_model: model,
        };
      }

      if (![429, 500, 502, 503, 504].includes(response.status)) {
        break;
      }
    }

    console.warn(
      "[ai.service] Gemini request failed:",
      lastResponse?.status,
      lastResponse?.text,
    );
    return withFallbackMeta(`gemini_http_${lastResponse?.status || "unknown"}`);
  } catch (error) {
    console.warn("[ai.service] Gemini unavailable:", error.message);
    return withFallbackMeta("gemini_unavailable");
  }
}

async function callAI(options) {
  const provider = String(process.env.AI_PROVIDER || "openai").toLowerCase();

  if (provider === "gemini") {
    return callGemini(options);
  }

  return callOpenAI(options);
}

function buildScheduleFallback(context) {
  const schedules = context.schedules || [];
  const byEmployee = new Map();
  const byDate = new Map();
  const warnings = [];

  schedules.forEach((schedule) => {
    const employeeName = schedule.employee_name || `NV #${schedule.employee_id}`;
    byEmployee.set(employeeName, (byEmployee.get(employeeName) || 0) + 1);
    byDate.set(schedule.work_date, (byDate.get(schedule.work_date) || 0) + 1);
  });

  const counts = [...byEmployee.entries()].sort((a, b) => b[1] - a[1]);
  const max = counts[0];
  const min = counts[counts.length - 1];

  if (max && min && max[1] - min[1] >= 3) {
    warnings.push({
      level: "medium",
      title: "Phân bổ ca chưa cân bằng",
      detail: `${max[0]} có ${max[1]} ca, trong khi ${min[0]} có ${min[1]} ca.`,
      affected: [max[0], min[0]],
    });
  }

  if (!schedules.length) {
    warnings.push({
      level: "high",
      title: "Chưa có lịch để phân tích",
      detail: "Bộ lọc hiện tại không có ca làm nào.",
      affected: [],
    });
  }

  return {
    summary: schedules.length
      ? `Có ${schedules.length} ca đã xếp cho ${counts.length} nhân viên.`
      : "Chưa có dữ liệu lịch trong phạm vi đang chọn.",
    fairness: max && min
      ? `Khoảng chênh lệch hiện tại là ${max[1] - min[1]} ca giữa người nhiều nhất và ít nhất.`
      : "Chưa đủ dữ liệu để đánh giá cân bằng.",
    coverage: `Có ${byDate.size} ngày có lịch trong phạm vi phân tích.`,
    warnings,
    suggestions: [
      "Kiểm tra các nhân viên có số ca cao nhất trước khi công bố lịch.",
      "Ưu tiên dùng bản nháp để thử đổi ca nếu phát hiện lệch tải.",
    ],
    next_actions: [
      "Bật cài đặt cân bằng lịch nếu tháng này có nhiều ca lệch nhau.",
      "Dùng bộ lọc theo ngày để kiểm tra các ngày có nhiều ca liên tiếp.",
    ],
  };
}

function buildRequestFallback(request) {
  const kind = request?.kind || "request";
  const isPending = ["PENDING", "PENDING_TARGET", "EDIT_PENDING"].includes(request?.status);

  return {
    recommendation: isPending ? "needs_review" : "no_action",
    confidence: "medium",
    summary: kind === "swap"
      ? "Yêu cầu đổi ca cần kiểm tra trùng lịch và ảnh hưởng tới hai nhân viên."
      : "Yêu cầu cần kiểm tra trạng thái, lịch rảnh và tác động tới lịch đã xếp.",
    risks: [
      "Cần xác nhận không phát sinh trùng ca hoặc thiếu người sau khi xử lý.",
    ],
    suggested_reply: isPending
      ? "Admin đã ghi nhận yêu cầu và sẽ kiểm tra lịch liên quan trước khi phản hồi."
      : "Yêu cầu này đã được xử lý, vui lòng kiểm tra trạng thái hiện tại.",
    checklist: [
      "Kiểm tra trạng thái yêu cầu.",
      "Đối chiếu lịch làm của nhân viên liên quan.",
      "Ghi rõ lý do nếu từ chối hoặc hoàn tác.",
    ],
  };
}

function buildChatFallback(message, context) {
  const schedules = context.schedules || [];
  const employees = new Set(schedules.map((item) => item.employee_id).filter(Boolean));
  const provider = String(process.env.AI_PROVIDER || "openai").toLowerCase();
  const providerLabel = provider === "gemini" ? "Gemini" : "OpenAI";
  const providerConfigured =
    provider === "gemini"
      ? Boolean(process.env.GEMINI_API_KEY)
      : Boolean(process.env.OPENAI_API_KEY);
  const question = normalizeVietnamese(message);
  const asksIdentity =
    question.includes("ban la ai") ||
    question.includes("m la ai") ||
    question.includes("may la ai") ||
    question.includes("tro ly gi") ||
    question.includes("ai vay");

  if (asksIdentity) {
    return {
      answer:
        "Mình là QQ, AI quản lý của Qshift. QQ hỗ trợ admin phân tích lịch làm, kiểm tra chấm công, tóm tắt yêu cầu và gợi ý thao tác từ dữ liệu hệ thống.",
      highlights: [
        "QQ chỉ dùng dữ liệu Qshift trong hệ thống để hỗ trợ phiên làm việc này.",
        "Các quyết định như duyệt, hủy hoặc sửa lịch vẫn cần admin xác nhận.",
      ],
      followups: [
        "Bạn có thể hỏi: Bây giờ ai đang làm việc?",
        "Bạn có thể hỏi: Hôm nay có gì cần giải quyết?",
      ],
      actions: [
        action("navigate", "Tạo lịch", "/createSchedule", "Mở trang tạo lịch"),
        action("navigate", "Yêu cầu", "/shiftSwaps", "Mở trang xử lý yêu cầu"),
      ],
    };
  }

  const navigation = navigationActionFor(question);
  if (navigation) {
    return {
      answer: navigation.answer,
      highlights: navigation.highlights,
      followups: navigation.followups,
      actions: navigation.actions,
    };
  }

  if (isTaskQuestion(question)) {
    const tasks = context.tasks || [];
    const openTasks = tasks.filter((task) => Number(task.count) > 0);
    return {
      answer: openTasks.length
        ? `Hôm nay có ${openTasks.reduce((sum, task) => sum + Number(task.count || 0), 0)} việc cần xem: ${openTasks
            .map((task) => `${task.count} ${task.label}`)
            .join(", ")}.`
        : "Hôm nay chưa thấy việc nào cần admin xử lý ngay trong các luồng yêu cầu chính.",
      highlights: openTasks.map((task) => task.description),
      followups: [
        "Bạn có thể bấm nút bên dưới để đi thẳng tới màn hình xử lý.",
        "Mình không thực hiện thao tác xóa trong chat.",
      ],
      actions: openTasks.map((task) =>
        action("navigate", task.action_label, task.path, task.description),
      ),
    };
  }

  if (isLateAttendanceQuestion(question)) {
    const now = context.now || vietnamDateTimeParts();
    const lateRows = context.today_late_attendance || [];
    const todayAttendance = context.today_attendance || [];
    const pendingLateRequests = context.today_late_requests || [];
    const missingCheckins = todayAttendance.filter(
      (record) => !record.check_in && record.progress_status === "NOT_CHECKED_IN",
    );

    if (lateRows.length) {
      return {
        answer: `Hôm nay (${now.date}) có ${lateRows.length} ca được ghi nhận đi trễ.`,
        highlights: lateRows.map((record) => {
          const minutes = Number(record.late_minutes || 0);
          const lateText = minutes > 0 ? `trễ ${minutes} phút` : "trễ";
          return `${record.employee_name || `NV #${record.employee_id}`} - ${record.shift_name} (${record.start_time}): check-in ${record.check_in || "-"}, ${lateText}.`;
        }),
        followups: pendingLateRequests.length
          ? [`Ngoài ra có ${pendingLateRequests.length} yêu cầu xin trễ hôm nay đang chờ xử lý.`]
          : missingCheckins.length
            ? [`Có ${missingCheckins.length} ca đã tới giờ nhưng chưa check-in, cần kiểm tra riêng trước khi kết luận.`]
            : ["Bạn có muốn mở trang chấm công để xem chi tiết không?"],
        actions: [
          action("navigate", "Xem chấm công", "/attendance", "Mở trang chấm công hôm nay"),
          action("navigate", "Báo cáo chấm công", "/attendance/history", "Mở lịch sử chấm công"),
        ],
      };
    }

    return {
      answer: `Hôm nay (${now.date}) chưa ghi nhận nhân viên nào check-in trễ trong dữ liệu chấm công hiện có.`,
      highlights: [
        todayAttendance.length
          ? `Đã kiểm tra ${todayAttendance.length} ca có lịch hôm nay.`
          : "Hôm nay chưa có ca làm đã công bố để đối chiếu chấm công.",
        pendingLateRequests.length
          ? `Có ${pendingLateRequests.length} yêu cầu xin trễ hôm nay đang chờ duyệt.`
          : "Không thấy yêu cầu xin trễ hôm nay đang chờ duyệt.",
      ],
      followups: missingCheckins.length
        ? [`Có ${missingCheckins.length} ca đã tới giờ nhưng chưa check-in, nên cần kiểm tra vắng/chưa chấm công riêng.`]
        : ["Bạn có thể hỏi tiếp: Hôm nay ai chưa check-in?"],
      actions: [
        action("navigate", "Xem chấm công", "/attendance", "Mở trang chấm công hôm nay"),
        action("navigate", "Báo cáo chấm công", "/attendance/history", "Mở lịch sử chấm công"),
      ],
    };
  }

  if (isTodayWorkerCountQuestion(question)) {
    const todaySchedules = context.today_schedules || [];
    const now = context.now || vietnamDateTimeParts();
    const counts = new Map();

    todaySchedules.forEach((schedule) => {
      const key = schedule.employee_name || `NV #${schedule.employee_id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    if (!sorted.length) {
      return {
        answer: `Hôm nay (${now.date}) chưa có nhân viên nào được xếp lịch làm việc.`,
        highlights: ["QQ đã kiểm tra lịch làm hôm nay trong hệ thống."],
        followups: ["Bạn có muốn mở lịch chung để kiểm tra ngày hôm nay không?"],
        actions: [
          action("navigate", "Xem lịch hôm nay", "/shifts", "Mở lịch chung"),
          action("navigate", "Tạo lịch", "/createSchedule", "Mở trang tạo/sửa lịch"),
        ],
      };
    }

    return {
      answer: `Hôm nay (${now.date}) có ${sorted.length} nhân viên làm việc, với tổng cộng ${todaySchedules.length} ca đã công bố.`,
      highlights: sorted
        .slice(0, 8)
        .map(([name, count]) => `${name}: ${count} ca`),
      followups: [
        "Bạn có thể hỏi tiếp: Bây giờ ai đang làm việc?",
        "Bạn có thể hỏi tiếp: Hôm nay có ai đi trễ không?",
      ],
      actions: [
        action("navigate", "Xem lịch hôm nay", "/shifts", "Mở lịch chung"),
        action("navigate", "Xem chấm công", "/attendance", "Mở trang chấm công"),
      ],
    };
  }

  if (isTodayLoadQuestion(question)) {
    const todaySchedules = context.today_schedules || [];
    const now = context.now || vietnamDateTimeParts();
    const counts = new Map();

    todaySchedules.forEach((schedule) => {
      const key = schedule.employee_name || `NV #${schedule.employee_id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const sorted = [...counts.entries()].sort((a, b) => {
      if (question.includes("it ca") || question.includes("ít ca")) return a[1] - b[1];
      return b[1] - a[1];
    });
    const top = sorted[0];

    if (!top) {
      return {
        answer: `Hôm nay (${now.date}) chưa có ca làm đã công bố trong hệ thống.`,
        highlights: [],
        followups: ["Bạn có thể mở trang tạo lịch để kiểm tra bộ lọc ngày hôm nay."],
        actions: [action("navigate", "Tạo lịch", "/createSchedule", "Mở trang tạo lịch")],
      };
    }

    const sameCount = sorted.filter((item) => item[1] === top[1]);
    const mode = question.includes("it ca") || question.includes("ít ca") ? "ít ca nhất" : "nhiều ca nhất";

    return {
      answer: `Hôm nay (${now.date}), ${sameCount
        .map(([name]) => name)
        .join(", ")} đang làm ${mode} với ${top[1]} ca.`,
      highlights: sameCount.map(([name, count]) => `${name}: ${count} ca`),
      followups: [
        "Bạn có muốn xem lịch làm việc hôm nay không?",
        `Bạn có muốn mở trang lịch để kiểm tra chi tiết ${sameCount[0][0]} không?`,
      ],
      actions: [
        action("navigate", "Xem lịch hôm nay", "/shifts", "Mở lịch làm hôm nay"),
        action("navigate", "Tạo lịch", "/createSchedule", "Mở trang tạo/sửa lịch"),
      ],
    };
  }

  const asksCurrentWorkers =
    question.includes("dang lam") ||
    question.includes("dang") ||
    question.includes("bay gio") ||
    question.includes("hien tai") ||
    question.includes("dang truc") ||
    question.includes("ai lam viec");

  if (asksCurrentWorkers) {
    const activeSchedules = context.active_schedules || [];
    const now = context.now || vietnamDateTimeParts();
    const answer = activeSchedules.length
      ? `Hiện tại (${now.time}, ${now.date}) đang có ${activeSchedules.length} nhân viên làm việc: ${activeSchedules
          .map(
            (item) =>
              `${item.employee_name || `NV #${item.employee_id}`} - ${item.shift_name} (${item.start_time} - ${item.end_time})`,
          )
          .join("; ")}.`
      : `Hiện tại (${now.time}, ${now.date}) không thấy nhân viên nào đang trong ca làm đã công bố.`;

    return {
      answer,
      highlights: [
        providerConfigured
          ? `${providerLabel} chưa phản hồi được nên câu trả lời đang dùng kiểm tra lịch nội bộ.`
          : `Chưa cấu hình ${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} nên câu trả lời đang dùng kiểm tra lịch nội bộ.`,
      ],
      followups: activeSchedules.length
        ? ["Kiểm tra trang chấm công để xác nhận nhân viên đã check-in."]
        : ["Kiểm tra lịch hôm nay hoặc ca qua đêm nếu bạn kỳ vọng đang có người làm."],
      actions: [
        action("navigate", "Chấm công", "/attendance", "Mở trang chấm công"),
        action("navigate", "Lịch làm", "/shifts", "Mở lịch làm"),
      ],
    };
  }

  return {
    answer: `Mình đã nhận câu hỏi: "${safeText(message)}". Hiện có ${schedules.length} ca và ${employees.size} nhân viên trong phạm vi dữ liệu gần nhất.`,
    highlights: [
      providerConfigured
        ? `${providerLabel} chưa phản hồi được nên câu trả lời đang dùng phân tích nội bộ cơ bản.`
        : `Chưa cấu hình ${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} nên câu trả lời đang dùng phân tích nội bộ cơ bản.`,
    ],
    followups: [
      providerConfigured
        ? `Kiểm tra kết nối mạng từ backend tới ${provider === "gemini" ? "generativelanguage.googleapis.com" : "api.openai.com"} hoặc quota/model của API key.`
        : `Cấu hình ${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} để assistant trả lời linh hoạt hơn từ dữ liệu hệ thống.`,
    ],
    actions: [
      action("navigate", "Tạo lịch", "/createSchedule", "Mở trang tạo và sửa lịch"),
      action("navigate", "Yêu cầu", "/shiftSwaps", "Mở trang xử lý yêu cầu"),
    ],
  };
}

const CHAT_DATA_SOURCE_LABELS = {
  today_schedules: "Lịch làm việc đã công bố hôm nay",
  active_schedules: "Ca đang diễn ra",
  today_attendance: "Chấm công hôm nay",
  attendance_history: "Lịch sử chấm công toàn hệ thống",
  pending_requests: "Các yêu cầu đang chờ xử lý",
  admin_requests: "Toàn bộ yêu cầu vận hành",
  employees: "Danh sách và trạng thái nhân sự",
  employee_directory: "Hồ sơ và tài khoản nhân viên",
  payroll_records: "Dữ liệu bảng lương",
  schedule_scope: "Lịch đã công bố trong phạm vi đang xem",
  upcoming_schedules: "Lịch làm việc 7 ngày tới",
  shift_catalog: "Danh mục ca làm việc",
};

function buildChatDataSources(keys = []) {
  return [...new Set(keys)]
    .filter((key) => CHAT_DATA_SOURCE_LABELS[key])
    .map((key) => ({ key, label: CHAT_DATA_SOURCE_LABELS[key] }));
}

function displayEmployeeName(row = {}) {
  return row.employee_name || `Nhân viên #${row.employee_id}`;
}

function scopeText(context = {}, isToday = false) {
  if (isToday) return `hôm nay (${context.now?.date || ""})`;
  const month = context.scope?.month;
  const year = context.scope?.year;
  return month && month !== "all" && year && year !== "all"
    ? `tháng ${month}/${year}`
    : "phạm vi lịch đang xem";
}

function groupScheduleRows(rows = [], keyForRow, valueName) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = keyForRow(row);
    if (!key) return;
    const item = grouped.get(key) || { name: valueName(row), count: 0, days: new Set() };
    item.count += Number(row.shift_count || 1);
    if (row.work_date) item.days.add(row.work_date);
    grouped.set(key, item);
  });
  return [...grouped.values()].map((item) => ({
    ...item,
    day_count: item.days.size || Number(item.work_day_count || 0),
  }));
}

function buildDataReasoningFallback(message, context = {}) {
  const question = normalizeVietnamese(message);
  const isToday = question.includes("hom nay") || question.includes("today");
  const scheduleRows = isToday
    ? groupScheduleRows(
        context.today_schedules || [],
        (row) => row.employee_id,
        displayEmployeeName,
      )
    : (context.schedule_workload || []).map((row) => ({
        name: displayEmployeeName(row),
        count: Number(row.shift_count || 0),
        day_count: Number(row.work_day_count || 0),
      }));
  const scope = scopeText(context, isToday);

  const asksShiftDensity =
    (question.includes("ca nao") || question.includes("ca gi") || question.includes("shift")) &&
    (question.includes("dong") ||
      question.includes("nhieu nguoi") ||
      question.includes("it nguoi") ||
      question.includes("thieu nguoi"));

  if (asksShiftDensity) {
    const rows = isToday
      ? groupScheduleRows(
          context.today_schedules || [],
          (row) => row.shift_id,
          (row) => row.shift_name || `Ca #${row.shift_id}`,
        )
      : (context.shift_workload || []).map((row) => ({
          name: row.shift_name || `Ca #${row.shift_id}`,
          count: Number(row.employee_count || 0),
          day_count: Number(row.work_day_count || 0),
        }));
    const wantsLowest = question.includes("it nguoi") || question.includes("thieu nguoi");
    const sorted = [...rows].sort((a, b) =>
      wantsLowest ? a.count - b.count : b.count - a.count,
    );
    const leading = sorted[0];

    if (!leading) {
      return {
        answer: `Chưa có lịch đã công bố trong ${scope} để so sánh mật độ từng ca.`,
        highlights: [],
        followups: ["Bạn có thể tạo hoặc công bố lịch trước khi kiểm tra phân bổ ca."],
        actions: [action("navigate", "Tạo lịch", "/createSchedule", "Mở trang tạo lịch")],
        data_sources: buildChatDataSources([isToday ? "today_schedules" : "schedule_scope"]),
      };
    }

    const tied = sorted.filter((row) => row.count === leading.count).slice(0, 3);
    return {
      answer: `${tied.map((row) => row.name).join(", ")} đang có ${
        wantsLowest ? "ít" : "nhiều"
      } nhân sự được xếp nhất trong ${scope}: ${leading.count} lượt phân công.`,
      highlights: sorted.slice(0, 4).map((row) => `${row.name}: ${row.count} lượt phân công`),
      followups: ["Số liệu là lượt phân công; cần đối chiếu yêu cầu nhân sự của từng ca trước khi kết luận thiếu người."],
      actions: [action("navigate", "Xem lịch làm việc", "/shifts", "Mở lịch làm việc")],
      data_sources: buildChatDataSources([isToday ? "today_schedules" : "schedule_scope"]),
    };
  }

  const asksWorkload =
    question.includes("nhieu ca") ||
    question.includes("it ca") ||
    question.includes("qua tai") ||
    question.includes("phan bo ca") ||
    question.includes("lam nhieu nhat") ||
    question.includes("lam it nhat");

  if (asksWorkload) {
    const wantsLowest =
      question.includes("it ca") || question.includes("lam it nhat");
    const sorted = [...scheduleRows].sort((a, b) =>
      wantsLowest ? a.count - b.count : b.count - a.count,
    );
    const leading = sorted[0];

    if (!leading) {
      return {
        answer: `Chưa có lịch đã công bố trong ${scope} để phân tích tải ca theo nhân viên.`,
        highlights: [],
        followups: ["Bạn có thể chọn một phạm vi có lịch đã công bố rồi hỏi lại."],
        actions: [action("navigate", "Xem lịch làm việc", "/shifts", "Mở lịch làm việc")],
        data_sources: buildChatDataSources([isToday ? "today_schedules" : "schedule_scope"]),
      };
    }

    const tied = sorted.filter((row) => row.count === leading.count).slice(0, 3);
    const total = sorted.reduce((sum, row) => sum + row.count, 0);
    return {
      answer: `${tied.map((row) => row.name).join(", ")} có ${
        wantsLowest ? "ít" : "nhiều"
      } ca nhất trong ${scope}: ${leading.count} ca.`,
      highlights: [
        `Tổng ${total} ca đã công bố cho ${sorted.length} nhân viên.`,
        ...sorted.slice(0, 4).map((row) => `${row.name}: ${row.count} ca${row.day_count ? ` / ${row.day_count} ngày` : ""}`),
      ],
      followups: ["Bạn có thể hỏi tiếp: Ca nào đang đông hoặc ít người nhất?"],
      actions: [action("navigate", "Xem lịch làm việc", "/shifts", "Mở lịch làm việc")],
      data_sources: buildChatDataSources([isToday ? "today_schedules" : "schedule_scope"]),
    };
  }

  const asksUpcoming =
    question.includes("tuan nay") ||
    question.includes("sap toi") ||
    question.includes("7 ngay") ||
    question.includes("ngay toi");
  if (asksUpcoming) {
    const rows = context.operational?.upcoming_schedules_7d || [];
    const byDate = groupScheduleRows(
      rows,
      (row) => row.work_date,
      (row) => row.work_date,
    );
    if (!byDate.length) {
      return {
        answer: "Chưa có lịch đã công bố trong 7 ngày tới.",
        highlights: [],
        followups: ["Bạn có thể mở trang tạo lịch để kiểm tra và công bố lịch."],
        actions: [action("navigate", "Tạo lịch", "/createSchedule", "Mở trang tạo lịch")],
        data_sources: buildChatDataSources(["upcoming_schedules"]),
      };
    }
    return {
      answer: `Trong 7 ngày tới có ${rows.length} lượt phân công trên ${byDate.length} ngày đã có lịch.`,
      highlights: byDate.slice(0, 7).map((row) => `${row.name}: ${row.count} ca`),
      followups: ["Bạn có thể hỏi tiếp về tải ca hoặc nhân sự trong ngày cụ thể."],
      actions: [action("navigate", "Xem lịch làm việc", "/shifts", "Mở lịch làm việc")],
      data_sources: buildChatDataSources(["upcoming_schedules"]),
    };
  }

  const asksAttendanceOverview =
    !isLateAttendanceQuestion(question) &&
    (question.includes("cham cong") ||
      question.includes("check in") ||
      question.includes("checkin") ||
      question.includes("vang mat"));
  if (asksAttendanceOverview) {
    const summary = context.context_summary?.attendance_today || {};
    const total = Number(context.today_attendance?.length || 0);
    return {
      answer: total
        ? `Hôm nay có ${total} bản ghi chấm công: ${summary.checked_in || 0} đang trong ca, ${
            summary.completed || 0
          } đã kết thúc, ${summary.late || 0} đi trễ và ${summary.not_checked_in || 0} chưa check-in.`
        : "Hôm nay chưa có bản ghi chấm công để tổng hợp.",
      highlights: total
        ? [
            `Đúng giờ: ${summary.on_time || 0}.`,
            `Ca sắp tới: ${summary.upcoming || 0}.`,
          ]
        : [],
      followups: ["Bạn có thể hỏi tiếp: Hôm nay có ai đi trễ không?"],
      actions: [action("navigate", "Xem chấm công", "/attendance", "Mở trang chấm công")],
      data_sources: buildChatDataSources(["today_attendance"]),
    };
  }

  const asksPayroll = question.includes("luong") || question.includes("payroll");
  if (asksPayroll) {
    const rows = context.operational?.payroll_records || [];
    const totalSalary = rows.reduce((sum, row) => sum + Number(row.total_salary || 0), 0);
    const totalHours = rows.reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
    return {
      answer: rows.length
        ? `Đã tìm thấy ${rows.length} bản ghi lương gần đây, tổng ${totalHours.toLocaleString("vi-VN")} giờ và ${totalSalary.toLocaleString("vi-VN")} VNĐ.`
        : "Chưa có bản ghi lương để tổng hợp.",
      highlights: rows.slice(0, 5).map(
        (row) => `${row.employee_name || "Nhân viên"} · ${row.month}/${row.year}: ${Number(row.total_salary || 0).toLocaleString("vi-VN")} VNĐ`,
      ),
      followups: ["Bạn có thể hỏi tiếp về nhân viên hoặc kỳ lương cụ thể."],
      actions: [action("navigate", "Mở bảng lương", "/payroll?tab=salary", "Mở trang bảng lương")],
      data_sources: buildChatDataSources(["payroll_records"]),
    };
  }

  const asksEmployeeDirectory =
    question.includes("danh sach nhan vien") || question.includes("ho so nhan vien") || question.includes("tai khoan nhan vien");
  if (asksEmployeeDirectory) {
    const rows = context.operational?.employee_directory || [];
    return {
      answer: rows.length
        ? `Hệ thống có ${rows.length} hồ sơ nhân viên trong danh mục hiện tại.`
        : "Chưa có hồ sơ nhân viên để hiển thị.",
      highlights: rows.slice(0, 8).map(
        (row) => `${row.name || "Nhân viên"} · ${row.employee_status || "Chưa rõ trạng thái"} · ${row.account_role || "Chưa có tài khoản"}`,
      ),
      followups: ["Bạn có thể nêu tên nhân viên để QQ tra cứu chi tiết hơn khi dữ liệu phù hợp."],
      actions: [action("navigate", "Mở quản lý nhân viên", "/employeePage", "Mở hồ sơ nhân viên")],
      data_sources: buildChatDataSources(["employee_directory"]),
    };
  }

  const asksAttendanceHistory =
    question.includes("lich su cham cong") || question.includes("cham cong gan day");
  if (asksAttendanceHistory) {
    const rows = context.operational?.attendance_history || [];
    return {
      answer: rows.length
        ? `Đã tìm thấy ${rows.length} bản ghi chấm công gần đây trong phạm vi tra cứu.`
        : "Chưa có bản ghi chấm công lịch sử để hiển thị.",
      highlights: rows.slice(0, 8).map(
        (row) => `${row.work_date || "-"} · ${row.employee_name || "Nhân viên"} · ${row.shift_name || "Ca làm"} · vào ${row.check_in || "-"}`,
      ),
      followups: ["Bạn có thể hỏi tiếp về một nhân viên hoặc ngày cụ thể."],
      actions: [action("navigate", "Mở lịch sử chấm công", "/attendance/history", "Mở lịch sử chấm công")],
      data_sources: buildChatDataSources(["attendance_history"]),
    };
  }

  return null;
}

function normalizeVietnamese(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function action(type, label, path = "", description = "", prompt = "") {
  return { type, label, path, description, prompt };
}

function hideProviderText(value) {
  return String(value || "")
    .replace(/\bGemini\b/gi, "QQ")
    .replace(/\bOpenAI\b/gi, "QQ")
    .replace(/\bbackend\b/gi, "hệ thống")
    .replace(/GEMINI_API_KEY|OPENAI_API_KEY/gi, "cấu hình AI")
    .replace(/generativelanguage\.googleapis\.com|api\.openai\.com/gi, "dịch vụ AI")
    .replace(/quota\/model của cấu hình AI/gi, "cấu hình AI")
    .replace(/quota\/model của API key/gi, "cấu hình AI")
    .replace(/API key/gi, "cấu hình AI")
    .replace(/Kiểm tra kết nối mạng từ hệ thống tới dịch vụ AI hoặc cấu hình AI\./gi, "QQ đang cần thêm dữ liệu hoặc kết nối ổn định hơn để trả lời linh hoạt.")
    .replace(/Cấu hình cấu hình AI để assistant trả lời linh hoạt hơn từ dữ liệu hệ thống\./gi, "QQ đang dùng phân tích cơ bản từ dữ liệu hiện có.");
}

function hideProviderDetails(payload = {}) {
  const cleaned = {
    ...payload,
    answer: hideProviderText(payload.answer),
    highlights: (payload.highlights || []).map(hideProviderText),
    followups: (payload.followups || []).map(hideProviderText),
    data_sources: (payload.data_sources || []).map((item) => ({
      ...item,
      label: hideProviderText(item.label),
    })),
    actions: (payload.actions || []).map((item) => ({
      ...item,
      label: hideProviderText(item.label),
      description: hideProviderText(item.description),
      prompt: hideProviderText(item.prompt),
    })),
  };

  delete cleaned.ai_provider;
  delete cleaned.ai_model;
  delete cleaned.ai_status;
  delete cleaned.fallback_reason;
  delete cleaned.qq_tools;
  return cleaned;
}

function isTaskQuestion(question) {
  return (
    question.includes("hom nay co gi") ||
    question.includes("can giai quyet") ||
    question.includes("viec can lam") ||
    question.includes("can xu ly") ||
    question.includes("xu ly yeu cau") ||
    question.includes("co gi can")
  );
}

function isTodayLoadQuestion(question) {
  return (
    question.includes("hom nay") &&
    (question.includes("nhieu ca") ||
      question.includes("nhiều ca") ||
      question.includes("it ca") ||
      question.includes("ít ca") ||
      question.includes("lam may ca") ||
      question.includes("làm mấy ca"))
  );
}

function isTodayWorkerCountQuestion(question) {
  return (
    (question.includes("hom nay") || question.includes("today")) &&
    (question.includes("bao nhieu nguoi") ||
      question.includes("may nguoi") ||
      question.includes("so nguoi") ||
      question.includes("bao nhieu nhan vien") ||
      question.includes("may nhan vien")) &&
    (question.includes("lam viec") ||
      question.includes("di lam") ||
      question.includes("lam") ||
      question.includes("co lich"))
  );
}

function isLateAttendanceQuestion(question) {
  return (
    (question.includes("hom nay") || question.includes("today")) &&
    (question.includes("di tre") ||
      question.includes("tre khong") ||
      question.includes("tre ca") ||
      question.includes("muon") ||
      question.includes("check-in tre") ||
      question.includes("checkin tre") ||
      question.includes("late"))
  );
}

function navigationActionFor(question) {
  if (question.includes("xoa") || question.includes("xóa")) {
    return {
      answer:
        "Mình không hỗ trợ thao tác xóa trong chat. Nếu cần xóa, admin hãy vào đúng màn hình và xác nhận trực tiếp.",
      highlights: ["Đây là giới hạn an toàn để tránh xóa nhầm dữ liệu vận hành."],
      followups: ["Mình vẫn có thể mở trang liên quan để bạn tự kiểm tra."],
      actions: [action("navigate", "Mở yêu cầu", "/shiftSwaps", "Mở trang yêu cầu")],
    };
  }

  const routes = [
    {
      keys: ["them nhan vien", "sua nhan vien", "nhan vien", "nhan su"],
      answer: "Mình có thể mở trang nhân sự để admin thêm hoặc sửa thông tin nhân viên.",
      label: "Nhân sự",
      path: "/employeePage",
    },
    {
      keys: ["them lich", "sua lich", "tao lich", "xep lich", "lich lam"],
      answer: "Mình có thể mở trang tạo lịch để admin thêm, sửa hoặc tự động xếp lịch.",
      label: "Tạo lịch",
      path: "/createSchedule",
    },
    {
      keys: ["yeu cau", "doi ca", "lich ranh", "xin nghi", "phan hoi"],
      answer: "Mình có thể mở trang yêu cầu để admin xử lý đổi ca, lịch rảnh và phản hồi.",
      label: "Yêu cầu",
      path: "/shiftSwaps",
    },
    {
      keys: ["cham cong", "di tre"],
      answer: "Mình có thể mở trang chấm công để admin kiểm tra trạng thái hôm nay.",
      label: "Chấm công",
      path: "/attendance",
    },
    {
      keys: ["luong", "bang luong", "payroll"],
      answer: "Mình có thể mở trang lương để admin kiểm tra bảng lương và phản hồi.",
      label: "Lương",
      path: "/payroll?tab=salary",
    },
    {
      keys: ["thong ke", "bao cao"],
      answer: "Mình có thể mở trang thống kê để admin xem báo cáo tổng quan.",
      label: "Thống kê",
      path: "/statistics",
    },
  ];

  const matched = routes.find((route) => route.keys.some((key) => question.includes(key)));
  if (!matched) return null;

  return {
    answer: matched.answer,
    highlights: ["Mình sẽ không tự ghi dữ liệu nếu chưa có màn hình xác nhận từ admin."],
    followups: ["Sau khi mở trang, bạn có thể thao tác thêm/sửa trực tiếp ở form của hệ thống."],
    actions: [action("navigate", matched.label, matched.path, matched.answer)],
  };
}

async function getManagerTasks() {
  const [swapRows, availabilityRows, payrollRows, lateRows] = await Promise.all([
    queryOrEmpty("SELECT COUNT(*) AS count FROM shift_swap_requests WHERE status = 'PENDING_TARGET'"),
    queryOrEmpty(
      "SELECT COUNT(*) AS count FROM availability_requests WHERE COALESCE(status, 'PENDING') IN ('PENDING', 'EDIT_PENDING')",
    ),
    queryOrEmpty("SELECT COUNT(*) AS count FROM payroll_feedback WHERE status = 'PENDING'"),
    queryOrEmpty("SELECT COUNT(*) AS count FROM attendance_late_requests WHERE status = 'PENDING'"),
  ]);

  return [
    {
      key: "shift_swaps",
      label: "yêu cầu đổi ca",
      count: Number(swapRows[0]?.count || 0),
      path: "/shiftSwaps",
      action_label: "Xử lý đổi ca",
      description: `${Number(swapRows[0]?.count || 0)} yêu cầu đổi ca đang chờ xử lý.`,
    },
    {
      key: "availability",
      label: "yêu cầu lịch rảnh",
      count: Number(availabilityRows[0]?.count || 0),
      path: "/shiftSwaps",
      action_label: "Xử lý lịch rảnh",
      description: `${Number(availabilityRows[0]?.count || 0)} yêu cầu lịch rảnh/chỉnh sửa đang chờ.`,
    },
    {
      key: "payroll",
      label: "phản hồi lương",
      count: Number(payrollRows[0]?.count || 0),
      path: "/shiftSwaps",
      action_label: "Xử lý phản hồi",
      description: `${Number(payrollRows[0]?.count || 0)} phản hồi lương đang chờ admin trả lời.`,
    },
    {
      key: "late",
      label: "yêu cầu xin trễ",
      count: Number(lateRows[0]?.count || 0),
      path: "/attendance",
      action_label: "Xử lý xin trễ",
      description: `${Number(lateRows[0]?.count || 0)} yêu cầu xin trễ đang chờ duyệt.`,
    },
  ];
}

async function getRequesterContext(authUser = {}) {
  const userId = authUser?.user_id || authUser?.id || null;
  if (!userId) {
    return {
      user_id: null,
      role: authUser?.role || null,
      username: null,
      employee: null,
    };
  }

  const [userRows, employeeRows] = await Promise.all([
    queryOrEmpty(
      `SELECT user_id, username, role
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    ),
    queryOrEmpty(
      `SELECT employee_id, name, email, phone, status
       FROM employees
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    ),
  ]);

  const user = userRows[0] || {};
  return {
    user_id: user.user_id || userId,
    role: user.role || authUser?.role || null,
    username: user.username || null,
    employee: employeeRows[0] || null,
  };
}

function countRowsBy(rows, key) {
  return rows.reduce((result, row) => {
    const value = row?.[key] || "UNKNOWN";
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function buildContextSummary({ context, tasks, operational, requester }) {
  const todayAttendance = context.today_attendance || [];
  const attendanceStatus = countRowsBy(todayAttendance, "progress_status");
  const checkedInCount = todayAttendance.filter(
    (record) => record.check_in && !record.check_out,
  ).length;
  const completedCount = todayAttendance.filter((record) => record.check_out).length;
  const pendingTasks = (tasks || []).filter((task) => Number(task.count || 0) > 0);

  return {
    timezone: "Asia/Ho_Chi_Minh",
    now: context.now,
    requester: {
      role: requester?.role || "UNKNOWN",
      username: requester?.username || null,
      employee_name: requester?.employee?.name || null,
      employee_id: requester?.employee?.employee_id || null,
    },
    scope: context.scope,
    counts: {
      employees_in_context: (context.employees || []).length,
      shifts_available: (operational.shift_catalog || []).length,
      schedules_in_scope: (context.schedules || []).length,
      today_schedules: (context.today_schedules || []).length,
      active_now: (context.active_schedules || []).length,
      today_attendance_records: todayAttendance.length,
      today_late_records: (context.today_late_attendance || []).length,
      pending_task_total: pendingTasks.reduce((sum, task) => sum + Number(task.count || 0), 0),
    },
    attendance_today: {
      checked_in: checkedInCount,
      completed: completedCount,
      on_time: attendanceStatus.ON_TIME || 0,
      late: attendanceStatus.LATE || 0,
      not_checked_in: attendanceStatus.NOT_CHECKED_IN || 0,
      upcoming: attendanceStatus.UPCOMING || 0,
    },
    pending_tasks: pendingTasks.map((task) => ({
      key: task.key,
      label: task.label,
      count: Number(task.count || 0),
      path: task.path,
    })),
    notes: [
      "Use now.date for any question about today.",
      "Use today_attendance for attendance, late, missing check-in and checked-in questions.",
      "Use pending_request_samples when admin asks what needs handling.",
      "Never perform or suggest delete actions from chat.",
    ],
  };
}

const QQ_TOOL_DEFINITIONS = [
  {
    name: "today_schedules",
    description: "Lịch làm đã công bố trong ngày hôm nay, dùng cho câu hỏi ai làm, bao nhiêu người làm, bao nhiêu ca hôm nay.",
  },
  {
    name: "active_schedules",
    description: "Các ca đang diễn ra tại thời điểm hiện tại, dùng cho câu hỏi bây giờ ai đang làm hoặc đang trực.",
  },
  {
    name: "today_attendance",
    description: "Dữ liệu chấm công hôm nay, gồm check-in, check-out, đi trễ, chưa check-in và ca sắp tới.",
  },
  {
    name: "pending_requests",
    description: "Các yêu cầu đang chờ admin xử lý: đổi ca, lịch rảnh, phản hồi lương, xin trễ.",
  },
  {
    name: "employees",
    description: "Danh sách nhân viên và thống kê trạng thái nhân sự.",
  },
  {
    name: "schedule_scope",
    description: "Lịch trong phạm vi tháng/năm hiện tại của chat, dùng cho câu hỏi tổng quan lịch hoặc phân bổ ca.",
  },
  {
    name: "upcoming_schedules",
    description: "Lịch 7 ngày tới, dùng cho câu hỏi sắp tới có gì hoặc tuần này ai làm.",
  },
  {
    name: "shift_catalog",
    description: "Danh mục ca làm, giờ bắt đầu/kết thúc và màu ca.",
  },
  {
    name: "employee_directory",
    description: "Hồ sơ, tài khoản, trạng thái và vai trò của toàn bộ nhân viên; chỉ dành cho admin.",
  },
  {
    name: "attendance_history",
    description: "Lịch sử chấm công gần đây của toàn hệ thống, gồm giờ vào/ra và trạng thái; chỉ dành cho admin.",
  },
  {
    name: "payroll_records",
    description: "Bảng lương, tổng giờ và phản hồi lương; chỉ dành cho admin.",
  },
  {
    name: "admin_requests",
    description: "Toàn bộ yêu cầu đổi ca, nghỉ phép, lịch rảnh, xin trễ và phản hồi lương; chỉ dành cho admin.",
  },
];

const QQ_TOOL_NAMES = QQ_TOOL_DEFINITIONS.map((tool) => tool.name);

function uniqueEmployeeCount(schedules = []) {
  return new Set(schedules.map((item) => item.employee_id).filter(Boolean)).size;
}

function executeQQTools(toolNames = [], compactContext = {}) {
  const names = [...new Set(toolNames)].filter((name) => QQ_TOOL_NAMES.includes(name));
  const selectedNames = names.length ? names : ["today_schedules", "today_attendance", "pending_requests"];
  const results = {};

  for (const name of selectedNames) {
    if (name === "today_schedules") {
      const rows = compactContext.today_schedules || [];
      results[name] = {
        summary: {
          schedule_count: rows.length,
          employee_count: uniqueEmployeeCount(rows),
          date: compactContext.now?.date || null,
        },
        rows,
      };
    } else if (name === "active_schedules") {
      const rows = compactContext.active_schedules || [];
      results[name] = {
        summary: {
          active_count: rows.length,
          employee_count: uniqueEmployeeCount(rows),
          time: compactContext.now?.time || null,
          date: compactContext.now?.date || null,
        },
        rows,
      };
    } else if (name === "today_attendance") {
      const rows = compactContext.today_attendance || [];
      results[name] = {
        summary: compactContext.context_summary?.attendance_today || {},
        late_rows: compactContext.today_late_attendance || [],
        late_requests: compactContext.today_late_requests || [],
        rows,
      };
    } else if (name === "pending_requests") {
      results[name] = {
        summary: compactContext.context_summary?.pending_tasks || [],
        samples: compactContext.operational?.pending_request_samples || {},
      };
    } else if (name === "employees") {
      results[name] = {
        status_counts: compactContext.operational?.employee_status_counts || [],
        rows: compactContext.employees || [],
      };
    } else if (name === "schedule_scope") {
      const rows = compactContext.schedules || [];
      results[name] = {
        summary: {
          schedule_count: rows.length,
          employee_count: uniqueEmployeeCount(rows),
          scope: compactContext.scope || {},
        },
        rows,
      };
    } else if (name === "upcoming_schedules") {
      const rows = compactContext.operational?.upcoming_schedules_7d || [];
      results[name] = {
        summary: {
          schedule_count: rows.length,
          employee_count: uniqueEmployeeCount(rows),
        },
        rows,
      };
    } else if (name === "shift_catalog") {
      results[name] = {
        rows: compactContext.operational?.shift_catalog || [],
      };
    } else if (name === "employee_directory") {
      results[name] = {
        rows: compactContext.operational?.employee_directory || [],
      };
    } else if (name === "attendance_history") {
      results[name] = {
        rows: compactContext.operational?.attendance_history || [],
      };
    } else if (name === "payroll_records") {
      results[name] = {
        rows: compactContext.operational?.payroll_records || [],
      };
    } else if (name === "admin_requests") {
      results[name] = compactContext.operational?.admin_requests || {};
    }
  }

  return {
    selected_tools: selectedNames,
    results,
  };
}

async function planQQTools({ message, history, compactContext, fallback }) {
  const plannerFallback = {
    selected_tools: ["today_schedules", "today_attendance", "pending_requests"],
    reason: "QQ chọn bộ dữ liệu mặc định để kiểm tra lịch, chấm công và yêu cầu.",
  };

  const plan = await callAI({
    fallback: plannerFallback,
    schema: {
      name: "qq_tool_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          selected_tools: {
            type: "array",
            items: {
              type: "string",
              enum: QQ_TOOL_NAMES,
            },
          },
          reason: { type: "string" },
        },
        required: ["selected_tools", "reason"],
      },
    },
    system:
      "You are QQ's tool planner for Qshift. Select only the internal data tools needed to answer the user's Vietnamese question. Do not answer the user. Return JSON only.",
    user: compactJson(
      {
        question: safeText(message),
        recent_chat: history,
        context_summary: compactContext.context_summary,
        available_tools: QQ_TOOL_DEFINITIONS,
      },
      7000,
    ),
  });

  if (plan?.ai_status === "fallback" && fallback) {
    return plannerFallback;
  }

  return {
    selected_tools: Array.isArray(plan.selected_tools) && plan.selected_tools.length
      ? plan.selected_tools
      : plannerFallback.selected_tools,
    reason: plan.reason || plannerFallback.reason,
  };
}

async function answerWithQQTools({
  message,
  history,
  compactContext,
  fallback,
}) {
  const plan = await planQQTools({
    message,
    history,
    compactContext,
    fallback,
  });
  const toolRun = executeQQTools(plan.selected_tools, compactContext);

  const answer = await callAI({
    fallback,
    schema: {
      name: "qq_agent_answer",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          answer: { type: "string" },
          highlights: { type: "array", items: { type: "string" } },
          followups: { type: "array", items: { type: "string" } },
          actions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["navigate", "prompt"] },
                label: { type: "string" },
                path: { type: "string" },
                description: { type: "string" },
                prompt: { type: "string" },
              },
              required: ["type", "label", "path", "description", "prompt"],
            },
          },
        },
        required: ["answer", "highlights", "followups", "actions"],
      },
    },
    system:
      "You are QQ, Qshift's AI manager. Always answer in Vietnamese. Use the tool_results JSON as the source of truth. Be direct, natural and useful. If the selected tools do not contain enough data, say exactly what is missing in user-friendly language. Never mention providers, API keys, backend, model, quota, or internal technical details. Never create delete actions and never approve/reject on behalf of admin.",
    user: compactJson(
      {
        question: safeText(message),
        recent_chat: history,
        context_summary: compactContext.context_summary,
        tool_plan: plan,
        tool_results: toolRun,
        navigation_rules: {
          schedule: "/shifts",
          create_schedule: "/createSchedule",
          attendance: "/attendance",
          attendance_history: "/attendance/history",
          requests: "/shiftSwaps",
          employees: "/employeePage",
          payroll: "/payroll?tab=salary",
          statistics: "/statistics",
        },
      },
      18000,
    ),
  });

  return {
    ...answer,
    data_sources:
      answer.data_sources?.length > 0
        ? answer.data_sources
        : buildChatDataSources(toolRun.selected_tools),
    qq_tools: toolRun.selected_tools,
  };
}

async function getOperationalContext({ now }) {
  const [
    employeeStatusRows,
    shiftRows,
    upcomingSchedules,
    swapRows,
    availabilityRows,
    payrollRows,
    lateRequestRows,
    employeeDirectory,
    attendanceHistory,
    payrollRecords,
    allAvailabilityRequests,
    allSwapRequests,
    leaveRequests,
  ] = await Promise.all([
    queryOrEmpty(
      `SELECT COALESCE(status, 'UNKNOWN') AS status, COUNT(*) AS count
       FROM employees
       GROUP BY COALESCE(status, 'UNKNOWN')
       ORDER BY count DESC`,
    ),
    queryOrEmpty(
      `SELECT
         shift_id,
         shift_name,
         TIME_FORMAT(start_time, '%H:%i') AS start_time,
         TIME_FORMAT(end_time, '%H:%i') AS end_time,
         color
       FROM shifts
       ORDER BY start_time ASC, shift_name ASC
       LIMIT 40`,
    ),
    queryOrEmpty(
      `SELECT
         s.schedule_id,
         s.employee_id,
         e.name AS employee_name,
         s.shift_id,
         sh.shift_name,
         TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
         TIME_FORMAT(sh.end_time, '%H:%i') AS end_time,
         DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
         s.status
       FROM schedules s
       LEFT JOIN employees e ON s.employee_id = e.employee_id
       LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
       WHERE s.status = 'PUBLISHED'
         AND s.work_date BETWEEN ? AND ?
       ORDER BY s.work_date ASC, sh.start_time ASC, e.name ASC
       LIMIT 100`,
      [now.date, addDays(now.date, 7)],
    ),
    queryOrEmpty(
      `SELECT
         sr.swap_request_id,
         sr.status,
         req.name AS requester_employee_name,
         tgt.name AS target_employee_name,
         DATE_FORMAT(rs.work_date, '%Y-%m-%d') AS requester_work_date,
         rsh.shift_name AS requester_shift_name,
         DATE_FORMAT(ts.work_date, '%Y-%m-%d') AS target_work_date,
         tsh.shift_name AS target_shift_name,
         DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM shift_swap_requests sr
       LEFT JOIN employees req ON sr.requester_employee_id = req.employee_id
       LEFT JOIN employees tgt ON sr.target_employee_id = tgt.employee_id
       LEFT JOIN schedules rs ON sr.requester_schedule_id = rs.schedule_id
       LEFT JOIN shifts rsh ON rs.shift_id = rsh.shift_id
       LEFT JOIN schedules ts ON sr.target_schedule_id = ts.schedule_id
       LEFT JOIN shifts tsh ON ts.shift_id = tsh.shift_id
       WHERE sr.status = 'PENDING_TARGET'
       ORDER BY sr.created_at DESC
       LIMIT 8`,
    ),
    queryOrEmpty(
      `SELECT
         ar.id,
         ar.employee_id,
         e.name AS employee_name,
         ar.month,
         ar.year,
         COALESCE(ar.status, 'PENDING') AS status,
         DATE_FORMAT(ar.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM availability_requests ar
       LEFT JOIN employees e ON ar.employee_id = e.employee_id OR ar.user_id = e.user_id
       WHERE COALESCE(ar.status, 'PENDING') IN ('PENDING', 'EDIT_PENDING')
       ORDER BY ar.created_at DESC, ar.id DESC
       LIMIT 8`,
    ),
    queryOrEmpty(
      `SELECT
         pf.feedback_id,
         pf.employee_id,
         e.name AS employee_name,
         pf.subject,
         pf.status,
         DATE_FORMAT(pf.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM payroll_feedback pf
       LEFT JOIN employees e ON pf.employee_id = e.employee_id
       WHERE pf.status = 'PENDING'
       ORDER BY pf.created_at DESC, pf.feedback_id DESC
       LIMIT 8`,
    ),
    queryOrEmpty(
      `SELECT
         lr.late_request_id,
         lr.employee_id,
         e.name AS employee_name,
         lr.requested_minutes,
         lr.status,
         DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
         sh.shift_name,
         TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
         DATE_FORMAT(lr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM attendance_late_requests lr
       LEFT JOIN employees e ON lr.employee_id = e.employee_id
       LEFT JOIN schedules s ON lr.schedule_id = s.schedule_id
       LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
       WHERE lr.status = 'PENDING'
       ORDER BY lr.created_at DESC
       LIMIT 8`,
    ),
    queryOrEmpty(
      `SELECT
         e.employee_id,
         e.name,
         e.email,
         e.phone,
         e.status AS employee_status,
         e.hourly_rate,
         DATE_FORMAT(e.hire_date, '%Y-%m-%d') AS hire_date,
         u.user_id,
         u.username,
         u.role AS account_role,
         u.status AS account_status
       FROM employees e
       LEFT JOIN users u ON e.user_id = u.user_id
       ORDER BY e.name ASC
       LIMIT 500`,
    ),
    queryOrEmpty(
      `SELECT
         a.attendance_id,
         e.name AS employee_name,
         DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
         sh.shift_name,
         TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
         TIME_FORMAT(sh.end_time, '%H:%i') AS end_time,
         DATE_FORMAT(a.check_in, '%Y-%m-%d %H:%i:%s') AS check_in,
         DATE_FORMAT(a.check_out, '%Y-%m-%d %H:%i:%s') AS check_out,
         a.status
       FROM attendance a
       LEFT JOIN employees e ON a.employee_id = e.employee_id
       LEFT JOIN schedules s ON a.schedule_id = s.schedule_id
       LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
       ORDER BY s.work_date DESC, a.attendance_id DESC
       LIMIT 1000`,
    ),
    queryOrEmpty(
      `SELECT
         p.payroll_id,
         e.name AS employee_name,
         p.month,
         p.year,
         p.total_hours,
         p.total_salary,
         DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM payroll p
       LEFT JOIN employees e ON p.employee_id = e.employee_id
       ORDER BY p.year DESC, p.month DESC, e.name ASC
       LIMIT 1000`,
    ),
    queryOrEmpty(
      `SELECT
         ar.id,
         e.name AS employee_name,
         ar.month,
         ar.year,
         COALESCE(ar.status, 'PENDING') AS status,
         ar.data,
         DATE_FORMAT(ar.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM availability_requests ar
       LEFT JOIN employees e ON ar.employee_id = e.employee_id OR ar.user_id = e.user_id
       ORDER BY ar.created_at DESC, ar.id DESC
       LIMIT 500`,
    ),
    queryOrEmpty(
      `SELECT
         sr.swap_request_id,
         sr.status,
         req.name AS requester_employee_name,
         tgt.name AS target_employee_name,
         DATE_FORMAT(rs.work_date, '%Y-%m-%d') AS requester_work_date,
         rsh.shift_name AS requester_shift_name,
         DATE_FORMAT(ts.work_date, '%Y-%m-%d') AS target_work_date,
         tsh.shift_name AS target_shift_name,
         sr.requester_note,
         sr.admin_cancel_reason,
         DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM shift_swap_requests sr
       LEFT JOIN employees req ON sr.requester_employee_id = req.employee_id
       LEFT JOIN employees tgt ON sr.target_employee_id = tgt.employee_id
       LEFT JOIN schedules rs ON sr.requester_schedule_id = rs.schedule_id
       LEFT JOIN shifts rsh ON rs.shift_id = rsh.shift_id
       LEFT JOIN schedules ts ON sr.target_schedule_id = ts.schedule_id
       LEFT JOIN shifts tsh ON ts.shift_id = tsh.shift_id
       ORDER BY sr.created_at DESC, sr.swap_request_id DESC
       LIMIT 500`,
    ),
    queryOrEmpty(
      `SELECT
         r.request_id,
         e.name AS employee_name,
         r.request_type,
         DATE_FORMAT(r.start_date, '%Y-%m-%d') AS start_date,
         DATE_FORMAT(r.end_date, '%Y-%m-%d') AS end_date,
         r.reason,
         r.status,
         DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM requests r
       LEFT JOIN employees e ON r.employee_id = e.employee_id
       ORDER BY r.created_at DESC, r.request_id DESC
       LIMIT 500`,
    ),
  ]);

  return {
    employee_status_counts: employeeStatusRows,
    shift_catalog: shiftRows,
    employee_directory: employeeDirectory,
    attendance_history: attendanceHistory,
    payroll_records: payrollRecords,
    upcoming_schedules_7d: upcomingSchedules,
    pending_request_samples: {
      shift_swaps: swapRows,
      availability: availabilityRows,
      payroll_feedback: payrollRows,
      late_requests: lateRequestRows,
    },
    admin_requests: {
      availability: allAvailabilityRequests,
      shift_swaps: allSwapRequests,
      leave_requests: leaveRequests,
      payroll_feedback: payrollRows,
      late_requests: lateRequestRows,
    },
  };
}

function shouldAnswerChatLocally(message) {
  const question = normalizeVietnamese(message);
  return (
    question.includes("ban la ai") ||
    question.includes("m la ai") ||
    question.includes("may la ai") ||
    question.includes("tro ly gi") ||
    question.includes("ai vay") ||
    question.includes("dang lam") ||
    question.includes("bay gio") ||
    question.includes("hien tai") ||
    question.includes("dang truc") ||
    question.includes("ai lam viec") ||
    isLateAttendanceQuestion(question) ||
    isTodayWorkerCountQuestion(question) ||
    isTodayLoadQuestion(question) ||
    isTaskQuestion(question) ||
    Boolean(navigationActionFor(question))
  );
}

function shouldUseImmediateLocalAnswer(message) {
  const question = normalizeVietnamese(message);
  return (
    question.includes("ban la ai") ||
    question.includes("m la ai") ||
    question.includes("may la ai") ||
    question.includes("tro ly gi") ||
    question.includes("ai vay") ||
    question.includes("xoa") ||
    question.includes("xóa")
  );
}

function employeeChatError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function describePersonalSchedule(schedule) {
  return `${schedule.work_date} · ${schedule.shift_name || "Ca làm"} (${schedule.start_time || "--:--"} - ${
    schedule.end_time || "--:--"
  })`;
}

function employeeChatAction(label, path, description) {
  return action("navigate", label, path, description);
}

async function getEmployeeChatContext(authUser = {}) {
  const userId = authUser?.user_id || authUser?.id;
  if (!userId) {
    throw employeeChatError("Không xác định được phiên đăng nhập.", 401);
  }

  const employeeRows = await queryOrEmpty(
    `SELECT employee_id, name
     FROM employees
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  );
  const employee = employeeRows[0];
  if (!employee) {
    throw employeeChatError("Tài khoản này chưa được liên kết với hồ sơ nhân viên.", 403);
  }

  const now = vietnamDateTimeParts();
  const upcomingEnd = addDays(now.date, 7);
  const [todaySchedules, upcomingSchedules, todayAttendance, availabilityRequests, swapRequests, lateRequests] =
    await Promise.all([
      queryOrEmpty(
        `SELECT
           s.schedule_id,
           s.shift_id,
           sh.shift_name,
           TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
           TIME_FORMAT(sh.end_time, '%H:%i') AS end_time,
           DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date
         FROM schedules s
         LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
         WHERE s.employee_id = ? AND s.status = 'PUBLISHED' AND s.work_date = ?
         ORDER BY sh.start_time ASC, s.schedule_id ASC`,
        [employee.employee_id, now.date],
      ),
      queryOrEmpty(
        `SELECT
           s.schedule_id,
           s.shift_id,
           sh.shift_name,
           TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
           TIME_FORMAT(sh.end_time, '%H:%i') AS end_time,
           DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date
         FROM schedules s
         LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
         WHERE s.employee_id = ? AND s.status = 'PUBLISHED' AND s.work_date BETWEEN ? AND ?
         ORDER BY s.work_date ASC, sh.start_time ASC
         LIMIT 50`,
        [employee.employee_id, now.date, upcomingEnd],
      ),
      queryOrEmpty(
        `SELECT
           s.schedule_id,
           sh.shift_name,
           TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
           TIME_FORMAT(sh.end_time, '%H:%i') AS end_time,
           DATE_FORMAT(a.check_in, '%Y-%m-%d %H:%i:%s') AS check_in,
           DATE_FORMAT(a.check_out, '%Y-%m-%d %H:%i:%s') AS check_out,
           CASE
             WHEN a.check_in IS NULL AND TIMESTAMP(s.work_date, sh.start_time) > (UTC_TIMESTAMP() + INTERVAL 7 HOUR) THEN 'UPCOMING'
             WHEN a.check_in IS NULL THEN 'NOT_CHECKED_IN'
             WHEN a.status = 'LATE' OR TIMESTAMPDIFF(MINUTE, TIMESTAMP(s.work_date, sh.start_time), a.check_in) > 0 THEN 'LATE'
             ELSE 'ON_TIME'
           END AS progress_status,
           CASE
             WHEN a.check_in IS NULL THEN NULL
             ELSE GREATEST(0, TIMESTAMPDIFF(MINUTE, TIMESTAMP(s.work_date, sh.start_time), a.check_in))
           END AS late_minutes
         FROM schedules s
         LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
         LEFT JOIN attendance a ON a.schedule_id = s.schedule_id
         WHERE s.employee_id = ? AND s.status = 'PUBLISHED' AND s.work_date = ?
         ORDER BY sh.start_time ASC, s.schedule_id ASC`,
        [employee.employee_id, now.date],
      ),
      queryOrEmpty(
        `SELECT id, month, year, COALESCE(status, 'PENDING') AS status
         FROM availability_requests
         WHERE (employee_id = ? OR user_id = ?)
           AND COALESCE(status, 'PENDING') IN ('PENDING', 'EDIT_PENDING')
         ORDER BY created_at DESC, id DESC
         LIMIT 10`,
        [employee.employee_id, userId],
      ),
      queryOrEmpty(
        `SELECT swap_request_id, status, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
         FROM shift_swap_requests
         WHERE requester_employee_id = ? OR target_employee_id = ?
         ORDER BY created_at DESC, swap_request_id DESC
         LIMIT 10`,
        [employee.employee_id, employee.employee_id],
      ),
      queryOrEmpty(
        `SELECT late_request_id, status, requested_minutes
         FROM attendance_late_requests
         WHERE employee_id = ? AND status = 'PENDING'
         ORDER BY created_at DESC, late_request_id DESC
         LIMIT 10`,
        [employee.employee_id],
      ),
    ]);

  return {
    employee: { employee_id: employee.employee_id, name: employee.name || "Bạn" },
    now,
    today_schedules: todaySchedules,
    upcoming_schedules: upcomingSchedules,
    active_schedules: todaySchedules.filter((schedule) => isScheduleActiveNow(schedule, now)),
    today_attendance: todayAttendance,
    pending_requests: {
      availability: availabilityRequests,
      swaps: swapRequests.filter((request) => request.status === "PENDING_TARGET"),
      late: lateRequests,
    },
  };
}

function buildEmployeeChatAnswer(message, context) {
  const question = normalizeVietnamese(message);
  const restrictedTerms = [
    "luong",
    "salary",
    "nhan vien khac",
    "danh sach nhan vien",
    "so dien thoai",
    "email",
    "dia chi",
    "ai dang lam",
    "ai lam viec",
    "bao cao",
    "thong ke",
  ];

  if (restrictedTerms.some((term) => question.includes(term))) {
    return {
      answer: "Mình chỉ hỗ trợ tra cứu lịch, chấm công và yêu cầu của chính bạn. Thông tin về lương, nhân sự hoặc báo cáo nội bộ không khả dụng trong chat này.",
      highlights: [],
      followups: ["Bạn có thể hỏi về ca hôm nay, lịch 7 ngày tới hoặc trạng thái yêu cầu của mình."],
      actions: [],
      data_sources: [],
    };
  }

  const asksCurrentShift =
    question.includes("dang lam") || question.includes("dang truc") || question.includes("hien tai");
  if (asksCurrentShift) {
    const active = context.active_schedules || [];
    return {
      answer: active.length
        ? `Hiện tại (${context.now.time}), bạn đang có ${active.length} ca: ${active
            .map(describePersonalSchedule)
            .join("; ")}.`
        : `Hiện tại (${context.now.time}), chưa thấy ca làm đã công bố nào của bạn đang diễn ra.`,
      highlights: active.length ? ["Thời gian được tính theo múi giờ Việt Nam."] : [],
      followups: ["Bạn có thể hỏi tiếp: Hôm nay tôi làm ca nào?"],
      actions: [employeeChatAction("Xem lịch của tôi", "/shifts", "Mở lịch làm việc cá nhân")],
      data_sources: buildChatDataSources(["active_schedules"]),
    };
  }

  const asksAttendance =
    question.includes("cham cong") || question.includes("check in") || question.includes("checkin") || question.includes("di tre");
  if (asksAttendance) {
    const records = context.today_attendance || [];
    const lateCount = records.filter((record) => record.progress_status === "LATE").length;
    const missingCount = records.filter((record) => record.progress_status === "NOT_CHECKED_IN").length;
    return {
      answer: records.length
        ? `Hôm nay bạn có ${records.length} ca chấm công: ${records.filter((record) => record.check_in).length} đã check-in, ${lateCount} đi trễ và ${missingCount} chưa check-in.`
        : "Hôm nay chưa có ca đã công bố để đối chiếu chấm công của bạn.",
      highlights: records.map((record) => {
        const status = record.progress_status === "LATE"
          ? `trễ ${record.late_minutes || 0} phút`
          : record.progress_status === "NOT_CHECKED_IN"
            ? "chưa check-in"
            : record.progress_status === "UPCOMING"
              ? "ca sắp tới"
              : "đúng giờ";
        return `${record.shift_name || "Ca làm"} (${record.start_time}): ${status}.`;
      }),
      followups: ["Bạn có thể mở chấm công để kiểm tra hoặc cập nhật theo quy định của công ty."],
      actions: [employeeChatAction("Xem chấm công", "/attendance", "Mở trang chấm công")],
      data_sources: buildChatDataSources(["today_attendance"]),
    };
  }

  const asksRequests =
    question.includes("yeu cau") || question.includes("doi ca") || question.includes("lich ranh") || question.includes("xin tre");
  if (asksRequests) {
    const requests = context.pending_requests || {};
    const total = (requests.availability?.length || 0) + (requests.swaps?.length || 0) + (requests.late?.length || 0);
    return {
      answer: total
        ? `Bạn đang có ${total} yêu cầu chờ xử lý.`
        : "Bạn hiện không có yêu cầu lịch rảnh, đổi ca hoặc xin trễ nào đang chờ xử lý.",
      highlights: total
        ? [
            `Lịch rảnh: ${requests.availability?.length || 0}.`,
            `Đổi ca: ${requests.swaps?.length || 0}.`,
            `Xin trễ: ${requests.late?.length || 0}.`,
          ]
        : [],
      followups: ["Bạn có thể mở trang lịch để gửi hoặc kiểm tra yêu cầu của mình."],
      actions: [employeeChatAction("Xem lịch của tôi", "/shifts", "Mở lịch và yêu cầu cá nhân")],
      data_sources: buildChatDataSources(["pending_requests"]),
    };
  }

  const asksToday =
    question.includes("hom nay") || question.includes("lich cua toi") || question.includes("ca cua toi");
  if (asksToday) {
    const schedules = context.today_schedules || [];
    return {
      answer: schedules.length
        ? `Hôm nay (${context.now.date}) bạn có ${schedules.length} ca: ${schedules
            .map(describePersonalSchedule)
            .join("; ")}.`
        : `Hôm nay (${context.now.date}) chưa có ca làm đã công bố cho bạn.`,
      highlights: schedules.length ? ["Lịch chỉ hiển thị các ca đã được công bố."] : [],
      followups: ["Bạn có thể hỏi tiếp: Lịch 7 ngày tới của tôi thế nào?"],
      actions: [employeeChatAction("Xem lịch của tôi", "/shifts", "Mở lịch làm việc cá nhân")],
      data_sources: buildChatDataSources(["today_schedules"]),
    };
  }

  const asksUpcoming =
    question.includes("tuan") || question.includes("sap toi") || question.includes("7 ngay") || question.includes("ngay toi");
  if (asksUpcoming) {
    const schedules = context.upcoming_schedules || [];
    return {
      answer: schedules.length
        ? `Trong 7 ngày tới, bạn có ${schedules.length} ca đã được công bố.`
        : "Bạn chưa có ca làm đã công bố trong 7 ngày tới.",
      highlights: schedules.slice(0, 8).map(describePersonalSchedule),
      followups: ["Bạn có thể mở lịch để xem toàn bộ các ca của mình."],
      actions: [employeeChatAction("Xem lịch của tôi", "/shifts", "Mở lịch làm việc cá nhân")],
      data_sources: buildChatDataSources(["upcoming_schedules"]),
    };
  }

  return {
    answer: `Mình có thể giúp bạn tra cứu thông tin cá nhân, ${context.employee.name}: lịch hôm nay, ca đang diễn ra, lịch 7 ngày tới, chấm công hôm nay và yêu cầu đang chờ xử lý.`,
    highlights: ["Chat này không hiển thị thông tin nhân sự, lương hoặc dữ liệu quản trị."],
    followups: [
      "Hôm nay tôi làm ca nào?",
      "Tình hình chấm công hôm nay của tôi thế nào?",
      "Tôi có yêu cầu nào đang chờ xử lý không?",
    ],
    actions: [],
    data_sources: [],
  };
}

export async function answerEmployeeChat({ message, user }) {
  if (user?.role !== "EMPLOYEE") {
    throw employeeChatError("Chỉ nhân viên mới có thể dùng trợ lý cá nhân.", 403);
  }
  const context = await getEmployeeChatContext(user);
  return buildEmployeeChatAnswer(message, context);
}

export async function getScheduleContext({ month, year }) {
  const hasMonth = month && month !== "all";
  const hasYear = year && year !== "all";
  const conditions = [];
  const params = [];

  if (hasMonth) {
    conditions.push("MONTH(s.work_date) = ?");
    params.push(Number(month));
  }
  if (hasYear) {
    conditions.push("YEAR(s.work_date) = ?");
    params.push(Number(year));
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const publishedWhereClause = `WHERE s.status = 'PUBLISHED'${
    conditions.length ? ` AND ${conditions.join(" AND ")}` : ""
  }`;
  const schedules = await queryOrEmpty(
    `SELECT
       s.schedule_id,
       s.employee_id,
       e.name as employee_name,
       s.shift_id,
       sh.shift_name,
       TIME_FORMAT(sh.start_time, '%H:%i') as start_time,
       TIME_FORMAT(sh.end_time, '%H:%i') as end_time,
       DATE_FORMAT(s.work_date, '%Y-%m-%d') as work_date,
       s.status
     FROM schedules s
     LEFT JOIN employees e ON s.employee_id = e.employee_id
     LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
     ${whereClause}
     ORDER BY s.work_date DESC, sh.start_time ASC
     LIMIT 1000`,
    params,
  );

  const [scheduleWorkload, shiftWorkload] = await Promise.all([
    queryOrEmpty(
      `SELECT
         s.employee_id,
         e.name AS employee_name,
         COUNT(*) AS shift_count,
         COUNT(DISTINCT s.work_date) AS work_day_count
       FROM schedules s
       LEFT JOIN employees e ON s.employee_id = e.employee_id
       ${publishedWhereClause}
       GROUP BY s.employee_id, e.name
       ORDER BY shift_count DESC, employee_name ASC
       LIMIT 200`,
      params,
    ),
    queryOrEmpty(
      `SELECT
         s.shift_id,
         sh.shift_name,
         TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
         TIME_FORMAT(sh.end_time, '%H:%i') AS end_time,
         COUNT(*) AS employee_count,
         COUNT(DISTINCT s.work_date) AS work_day_count
       FROM schedules s
       LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
       ${publishedWhereClause}
       GROUP BY s.shift_id, sh.shift_name, sh.start_time, sh.end_time
       ORDER BY employee_count DESC, sh.start_time ASC
       LIMIT 80`,
      params,
    ),
  ]);

  const employees = await queryOrEmpty(
    `SELECT employee_id, name, email
     FROM employees
     ORDER BY name ASC
     LIMIT 500`,
  );

  const settings = await queryOrEmpty("SELECT * FROM schedule_settings LIMIT 1");
  const now = vietnamDateTimeParts();
  const activeCandidates = await queryOrEmpty(
    `SELECT
       s.schedule_id,
       s.employee_id,
       e.name as employee_name,
       s.shift_id,
       sh.shift_name,
       TIME_FORMAT(sh.start_time, '%H:%i') as start_time,
       TIME_FORMAT(sh.end_time, '%H:%i') as end_time,
       DATE_FORMAT(s.work_date, '%Y-%m-%d') as work_date,
       s.status
     FROM schedules s
     LEFT JOIN employees e ON s.employee_id = e.employee_id
     LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
     WHERE s.status = 'PUBLISHED'
       AND s.work_date IN (?, ?)
     ORDER BY sh.start_time ASC, e.name ASC`,
    [addDays(now.date, -1), now.date],
  );
  const activeSchedules = activeCandidates.filter((schedule) =>
    isScheduleActiveNow(schedule, now),
  );
  const todaySchedules = await queryOrEmpty(
    `SELECT
       s.schedule_id,
       s.employee_id,
       e.name as employee_name,
       s.shift_id,
       sh.shift_name,
       TIME_FORMAT(sh.start_time, '%H:%i') as start_time,
       TIME_FORMAT(sh.end_time, '%H:%i') as end_time,
       DATE_FORMAT(s.work_date, '%Y-%m-%d') as work_date,
       s.status
     FROM schedules s
     LEFT JOIN employees e ON s.employee_id = e.employee_id
     LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
     WHERE s.status = 'PUBLISHED'
       AND s.work_date = ?
    ORDER BY sh.start_time ASC, e.name ASC`,
    [now.date],
  );
  const todayAttendance = await queryOrEmpty(
    `SELECT
       s.schedule_id,
       s.employee_id,
       e.name as employee_name,
       s.shift_id,
       sh.shift_name,
       TIME_FORMAT(sh.start_time, '%H:%i') as start_time,
       TIME_FORMAT(sh.end_time, '%H:%i') as end_time,
       DATE_FORMAT(s.work_date, '%Y-%m-%d') as work_date,
       DATE_FORMAT(a.check_in, '%Y-%m-%d %H:%i:%s') as check_in,
       DATE_FORMAT(a.check_out, '%Y-%m-%d %H:%i:%s') as check_out,
       a.status as attendance_status,
       CASE
         WHEN a.check_in IS NULL AND TIMESTAMP(s.work_date, sh.start_time) > (UTC_TIMESTAMP() + INTERVAL 7 HOUR) THEN 'UPCOMING'
         WHEN a.check_in IS NULL THEN 'NOT_CHECKED_IN'
         WHEN a.status = 'LATE' OR TIMESTAMPDIFF(MINUTE, TIMESTAMP(s.work_date, sh.start_time), a.check_in) > 0 THEN 'LATE'
         ELSE 'ON_TIME'
       END as progress_status,
       CASE
         WHEN a.check_in IS NULL THEN NULL
         ELSE GREATEST(0, TIMESTAMPDIFF(MINUTE, TIMESTAMP(s.work_date, sh.start_time), a.check_in))
       END as late_minutes
     FROM schedules s
     LEFT JOIN employees e ON s.employee_id = e.employee_id
     LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
     LEFT JOIN attendance a ON a.schedule_id = s.schedule_id
     WHERE s.status = 'PUBLISHED'
       AND s.work_date = ?
     ORDER BY sh.start_time ASC, e.name ASC`,
    [now.date],
  );
  const todayLateAttendance = todayAttendance.filter(
    (record) =>
      record.progress_status === "LATE" ||
      record.attendance_status === "LATE" ||
      Number(record.late_minutes || 0) > 0,
  );
  const todayLateRequests = await queryOrEmpty(
    `SELECT
       lr.late_request_id,
       lr.employee_id,
       e.name as employee_name,
       lr.schedule_id,
       lr.requested_minutes,
       lr.status,
       DATE_FORMAT(lr.late_until, '%Y-%m-%d %H:%i:%s') as late_until,
       DATE_FORMAT(s.work_date, '%Y-%m-%d') as work_date,
       sh.shift_name,
       TIME_FORMAT(sh.start_time, '%H:%i') as start_time
     FROM attendance_late_requests lr
     LEFT JOIN employees e ON lr.employee_id = e.employee_id
     LEFT JOIN schedules s ON lr.schedule_id = s.schedule_id
     LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
     WHERE lr.status = 'PENDING'
       AND s.work_date = ?
     ORDER BY sh.start_time ASC, e.name ASC`,
    [now.date],
  );
  const availability = hasMonth && hasYear
    ? await queryOrEmpty(
        `SELECT
           ea.employee_id,
           e.name as employee_name,
           ea.shift_id,
           sh.shift_name,
           DATE_FORMAT(ea.work_date, '%Y-%m-%d') as work_date
         FROM employee_availability ea
         LEFT JOIN employees e ON ea.employee_id = e.employee_id
         LEFT JOIN shifts sh ON ea.shift_id = sh.shift_id
         WHERE MONTH(ea.work_date) = ? AND YEAR(ea.work_date) = ?
         LIMIT 120`,
        [Number(month), Number(year)],
      )
    : [];

  return {
    scope: { month: month || "all", year: year || "all" },
    settings: settings[0] || {},
    employees,
    schedules,
    schedule_workload: scheduleWorkload,
    shift_workload: shiftWorkload,
    active_schedules: activeSchedules,
    today_schedules: todaySchedules,
    today_attendance: todayAttendance,
    today_late_attendance: todayLateAttendance,
    today_late_requests: todayLateRequests,
    now,
    availability,
  };
}

export async function analyzeSchedule({ month, year }) {
  const context = await getScheduleContext({ month, year });
  const fallback = buildScheduleFallback(context);

  return callAI({
    fallback,
    schema: {
      name: "schedule_analysis",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          fairness: { type: "string" },
          coverage: { type: "string" },
          warnings: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                level: { type: "string", enum: ["low", "medium", "high"] },
                title: { type: "string" },
                detail: { type: "string" },
                affected: { type: "array", items: { type: "string" } },
              },
              required: ["level", "title", "detail", "affected"],
            },
          },
          suggestions: { type: "array", items: { type: "string" } },
          next_actions: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "fairness", "coverage", "warnings", "suggestions", "next_actions"],
      },
    },
    system:
      "Bạn là trợ lý AI cho quản lý ca làm Qshift. Phân tích lịch bằng tiếng Việt, ngắn gọn, thực tế. Không bịa dữ liệu ngoài JSON được cung cấp.",
    user: `Phân tích lịch xếp sau và trả JSON đúng schema.\n\n${compactJson(context)}`,
  });
}

export async function analyzeRequest({ request }) {
  const fallback = buildRequestFallback(request);
  const month = request?.month || "";
  const year = request?.year || "";
  const context = month && year ? await getScheduleContext({ month, year }) : { schedules: [] };

  return callAI({
    fallback,
    schema: {
      name: "request_analysis",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          recommendation: {
            type: "string",
            enum: ["approve", "reject", "remind", "needs_review", "no_action"],
          },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          summary: { type: "string" },
          risks: { type: "array", items: { type: "string" } },
          suggested_reply: { type: "string" },
          checklist: { type: "array", items: { type: "string" } },
        },
        required: ["recommendation", "confidence", "summary", "risks", "suggested_reply", "checklist"],
      },
    },
    system:
      "Bạn hỗ trợ admin xử lý yêu cầu đổi ca, xin sửa lịch rảnh, xin nghỉ hoặc phản hồi liên quan nhân sự. Trả lời tiếng Việt, không tự phê duyệt thay admin.",
    user: `Hãy phân tích yêu cầu và dữ liệu lịch liên quan. Trả JSON đúng schema.\n\n${compactJson({ request, context })}`,
  });
}

export async function answerManagerChat({
  message,
  history = [],
  month,
  year,
  user,
}) {
  const now = new Date();
  const context = await getScheduleContext({
    month: month && month !== "all" ? month : now.getMonth() + 1,
    year: year && year !== "all" ? year : now.getFullYear(),
  });
  const tasks = await getManagerTasks();
  const requester = await getRequesterContext(user);
  const operational = await getOperationalContext({ now: context.now });
  const context_summary = buildContextSummary({
    context,
    tasks,
    operational,
    requester,
  });
  const compactContext = {
    context_summary,
    requester,
    operational,
    ...context,
    employees: (context.employees || []).slice(0, 500),
    schedules: (context.schedules || []).slice(0, 1000),
    today_schedules: context.today_schedules || [],
    today_attendance: context.today_attendance || [],
    today_late_attendance: context.today_late_attendance || [],
    today_late_requests: context.today_late_requests || [],
    availability: (context.availability || []).slice(0, 30),
    tasks,
  };
  const fallback =
    buildDataReasoningFallback(message, compactContext) ||
    buildChatFallback(message, compactContext);

  if (shouldUseImmediateLocalAnswer(message)) {
    return hideProviderDetails({
      ...fallback,
      ai_status: "local",
      ai_provider: "qshift-rules",
    });
  }

  return hideProviderDetails(await answerWithQQTools({
    message,
    history,
    compactContext,
    fallback,
  }));

  return hideProviderDetails(await callAI({
    fallback,
    schema: {
      name: "manager_chat_answer",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          answer: { type: "string" },
          highlights: { type: "array", items: { type: "string" } },
          followups: { type: "array", items: { type: "string" } },
          actions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["navigate", "prompt"] },
                label: { type: "string" },
                path: { type: "string" },
                description: { type: "string" },
                prompt: { type: "string" },
              },
              required: ["type", "label", "path", "description", "prompt"],
            },
          },
        },
        required: ["answer", "highlights", "followups", "actions"],
      },
    },
    system:
      "Bạn là chat assistant cho quản lý Qshift. Trả lời bằng tiếng Việt, dựa trên dữ liệu JSON, nêu rõ nếu dữ liệu không đủ. Khi người dùng nói 'hôm nay', bắt buộc dùng trường now.date và today_schedules, không tự suy ngày từ dữ liệu gần nhất. Có thể đề xuất actions để mở trang hoặc gợi ý câu hỏi tiếp theo. Không tạo action xóa dữ liệu, không tự xóa, không tự duyệt thay admin, và không tiết lộ thông tin nhạy cảm ngoài ngữ cảnh được cung cấp.",
    user: `Lịch sử chat gần nhất: ${compactJson(history, 2500)}\n\nCâu hỏi: ${safeText(message)}\n\nDữ liệu hệ thống: ${compactJson(compactContext, 9000)}`,
  }));
}
