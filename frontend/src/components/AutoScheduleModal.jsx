import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  Card,
  Button,
  Input,
  Select,
  Option,
  Typography,
  Tabs,
  TabsHeader,
  TabsBody,
  Tab,
  TabPanel,
  Switch,
} from "@material-tailwind/react";
import axios from "axios";
import DraftSchedulesModal from "./DraftSchedulesModal";

const DAYS_OF_WEEK = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
];

export default function AutoScheduleModal({
  open,
  onClose,
  onGenerate,
  scheduleSettings,
}) {
  const dialogRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const previousFocusRef = useRef(null);

  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [shifts, setShifts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [activeTab, setActiveTab] = useState("setup");
  const [availability, setAvailability] = useState({});
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [generationNotice, setGenerationNotice] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [showDraftModal, setShowDraftModal] = useState(false);

  const [configMode, setConfigMode] = useState("general");
  const [generalConfig, setGeneralConfig] = useState({});
  const [detailedConfig, setDetailedConfig] = useState({});
  const [roleRequirements, setRoleRequirements] = useState({});

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;

      const focusTimer = setTimeout(() => {
        if (dialogRef.current) {
          const focusableElements = dialogRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          focusableElements[0]?.focus();
        }
      }, 100);

      fetchShifts();
      fetchRoles();
      fetchDrafts();

      return () => clearTimeout(focusTimer);
    } else {
      if (previousFocusRef.current?.focus) {
        try {
          previousFocusRef.current.focus();
        } catch {
          document.body.focus();
        }
      }
    }
  }, [open]);

  // Re-initialize configs when shifts are loaded
  useEffect(() => {
    if (shifts.length > 0) {
      initializeConfigs();
    }
  }, [shifts]);

  // Fetch availability when month/year changes
  useEffect(() => {
    if (open) {
      fetchAvailability();
    }
  }, [month, year, open]);

  const fetchShifts = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/shifts");
      setShifts(res.data);
      fetchShiftRoleRequirements(res.data);
      console.log("[fetchShifts] Got", res.data.length, "shifts");
    } catch (err) {
      console.error("Error fetching shifts:", err);
    }
  };

  const fetchShiftRoleRequirements = async (shiftList) => {
    try {
      const token = localStorage.getItem("token");
      const responses = await Promise.all(
        shiftList.map((shift) =>
          axios.get(`http://localhost:5000/api/roles/shift/${shift.shift_id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      );

      const requirements = {};
      responses.forEach((response, index) => {
        const shiftId = shiftList[index].shift_id;
        requirements[shiftId] = {};
        response.data.forEach((item) => {
          requirements[shiftId][item.role_id] = Number(item.required_count) || 0;
        });
      });

      setRoleRequirements(requirements);
    } catch (err) {
      console.error("Error fetching shift role requirements:", err);
      setRoleRequirements({});
    }
  };

  const fetchAvailability = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `http://localhost:5000/api/schedules/availability/${month}/${year}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setAvailability(res.data.availability || {});
      console.log(
        "[fetchAvailability] Got availability data for",
        month,
        "/",
        year,
      );
    } catch (err) {
      console.error("Error fetching availability:", err);
      setAvailability({});
    }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/roles", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRoles(res.data);
    } catch (err) {
      console.error("Error fetching roles:", err);
      setRoles([]);
    }
  };

  const fetchDrafts = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        "http://localhost:5000/api/schedules/drafts",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setDrafts(res.data);
    } catch (err) {
      console.error("Error fetching drafts:", err);
    }
  };

  // Initialize both configs on mount
  const initializeConfigs = () => {
    // Initialize general config (all days, all shifts with default 0)
    const general = {};
    DAYS_OF_WEEK.forEach((_, dayIndex) => {
      general[dayIndex] = {};
      shifts.forEach((shift) => {
        general[dayIndex][shift.shift_id] = 0;
      });
    });
    setGeneralConfig(general);

    // Initialize detailed config with general data
    initializeDetailedFromGeneral(general);
  };

  // Convert general config to detailed (fill calendar)
  const initializeDetailedFromGeneral = (general) => {
    const detailed = buildDetailedConfigFromGeneral(general);
    setDetailedConfig(detailed);
  };

  const buildDetailedConfigFromGeneral = (general) => {
    const detailed = {};
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = (date.getDay() + 6) % 7; // Convert to 0=Monday, 6=Sunday
      // Build date string directly to avoid timezone issues
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      detailed[dateStr] = { ...general[dayOfWeek] };
    }

    return detailed;
  };

  // Toggle mode and auto-fill detailed from general
  const handleModeToggle = (newMode) => {
    if (newMode === "detailed" && configMode === "general") {
      // Converting from general to detailed
      initializeDetailedFromGeneral(generalConfig);
    }
    setConfigMode(newMode);
  };

  // Reset all configurations
  const handleReset = () => {
    if (confirm("Bạn chắc chắn muốn đặt lại toàn bộ cấu hình?")) {
      initializeConfigs();
    }
  };

  // Auto-fill all workdays with 1 employee per shift
  const HANDLE_AUTO_FILL_WORKDAYS = () => {
    if (configMode === "detailed") {
      setDetailedConfig((prev) => {
        const updated = { ...prev };
        Object.entries(prev).forEach(([dateStr, dayConfig]) => {
          const date = new Date(dateStr + "T00:00:00");
          const dayOfWeek = date.getDay();
          // Only fill workdays (Mon-Fri)
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            Object.keys(dayConfig).forEach((shiftId) => {
              updated[dateStr][shiftId] = 1;
            });
          }
        });
        return updated;
      });
      alert("Đã điền 1 nhân viên cho mỗi ca trên tất cả các ngày làm việc");
    } else {
      // Mode general - cập nhật general config rồi convert sang detailed
      setGeneralConfig((prev) => {
        const updated = { ...prev };
        // Only fill workdays (Mon-Fri: dayIndex 0-4)
        for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
          if (!updated[dayIndex]) updated[dayIndex] = {};
          shifts.forEach((shift) => {
            updated[dayIndex][shift.shift_id] = 1;
          });
        }

        // Tự động convert sang mode detailed
        const detailed = {};
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const dayOfWeek = (date.getDay() + 6) % 7;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          detailed[dateStr] = { ...updated[dayOfWeek] };
        }
        setDetailedConfig(detailed);
        setConfigMode("detailed");

        return updated;
      });
      alert(
        "Đã điền 1 nhân viên cho mỗi ca vào các ngày làm việc + Chuyển sang mode chi tiết",
      );
    }
  };

  // Copy previous week to current week
  const HANDLE_COPY_PREVIOUS_MONTH = async () => {
    if (month === 1) {
      alert("Không thể sao chép từ tháng trước khi ở tháng 1");
      return;
    }

    try {
      // For now, just reset to default
      initializeConfigs();
      alert("Đã đặt lại cấu hình. Bạn có thể chỉnh sửa theo nhu cầu.");
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  // Handlers for general mode
  const setGeneralValue = (dayOfWeek, shiftId, value) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    setGeneralConfig((prev) => ({
      ...prev,
      [dayOfWeek]: {
        ...prev[dayOfWeek],
        [shiftId]: numValue,
      },
    }));
  };

  // Handlers for detailed mode
  const setDetailedValue = (dateStr, shiftId, value) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    setDetailedConfig((prev) => ({
      ...prev,
      [dateStr]: {
        ...prev[dateStr],
        [shiftId]: numValue,
      },
    }));
  };

  const setRoleRequirement = (shiftId, roleId, value) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    setRoleRequirements((prev) => ({
      ...prev,
      [shiftId]: {
        ...prev[shiftId],
        [roleId]: numValue,
      },
    }));
  };

  const buildRoleRequirementsPayload = () => {
    return Object.entries(roleRequirements).reduce((payload, [shiftId, roleCounts]) => {
      const normalizedRoles = Object.entries(roleCounts || {}).reduce(
        (rolePayload, [roleId, count]) => {
          const numCount = Number(count) || 0;
          if (numCount > 0) {
            const role = roles.find(
              (item) => Number(item.role_id) === Number(roleId),
            );
            rolePayload[Number(roleId)] = {
              required_count: numCount,
              role_name: role?.role_name,
            };
          }
          return rolePayload;
        },
        {},
      );

      if (Object.keys(normalizedRoles).length > 0) {
        payload[Number(shiftId)] = normalizedRoles;
      }

      return payload;
    }, {});
  };

  const handleGenerate = async () => {
    setGenerationNotice(null);

    const configForGeneration =
      configMode === "general"
        ? buildDetailedConfigFromGeneral(generalConfig)
        : detailedConfig;
    if (configMode === "general") {
      setDetailedConfig(configForGeneration);
    }

    const hasRequirements = Object.values(configForGeneration).some((dayConfig) =>
      Object.values(dayConfig).some((count) => count > 0),
    );

    if (!hasRequirements) {
      alert("Vui lòng cấu hình ít nhất 1 nhân viên cho bất kỳ ca nào");
      return;
    }

    const normalizedDetailedConfig = {};
    Object.entries(configForGeneration).forEach(([dateStr, dayConfig]) => {
      normalizedDetailedConfig[dateStr] = {};
      Object.entries(dayConfig).forEach(([shiftId, count]) => {
        const numShiftId = Number(shiftId);
        normalizedDetailedConfig[dateStr][numShiftId] = Number(count);
      });
    });

    console.log("[handleGenerate] Normalized config:", {
      dateCount: Object.keys(normalizedDetailedConfig).length,
      sample: Object.entries(normalizedDetailedConfig)
        .slice(0, 2)
        .reduce((acc, [date, config]) => {
          acc[date] = config;
          return acc;
        }, {}),
    });

    const shiftsMap = {};
    Object.values(normalizedDetailedConfig).forEach((dayConfig) => {
      Object.entries(dayConfig).forEach(([shiftIdStr, count]) => {
        const shiftId = Number(shiftIdStr);
        if (count > 0) {
          if (!shiftsMap[shiftId]) {
            shiftsMap[shiftId] = [];
          }
          shiftsMap[shiftId].push(count);
        }
      });
    });

    const shiftsWithRequirements = Object.entries(shiftsMap).map(
      ([shiftIdStr, requirements]) => ({
        shift_id: Number(shiftIdStr),
        required_employees: Math.ceil(
          requirements.reduce((a, b) => a + b, 0) / requirements.length,
        ),
      }),
    );

    if (shiftsWithRequirements.length === 0) {
      alert("Không tìm thấy ca nào để xếp lịch");
      return;
    }

    console.log("[handleGenerate] Shifts to send:", shiftsWithRequirements);
    const roleRequirementsPayload = buildRoleRequirementsPayload();

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      console.log("[handleGenerate] API payload:", {
        month,
        year,
        shiftsCount: shiftsWithRequirements.length,
        shifts: shiftsWithRequirements,
        detailedConfigDateCount: Object.keys(normalizedDetailedConfig).length,
        availabilityCount: Object.keys(availability).length,
      });

      const response = await axios.post(
        "http://localhost:5000/api/schedules/auto-generate",
        {
          month,
          year,
          shifts: shiftsWithRequirements,
          detailed_requirements: normalizedDetailedConfig,
          role_requirements: roleRequirementsPayload,
          scheduling_settings: scheduleSettings,
          availability: availability,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("[handleGenerate] Response:", response.data);
      setGeneratedSchedule(response.data);
      setGenerationNotice({
        type: "success",
        message: `Đã tạo lịch cho tháng ${month}/${year}. Vui lòng kiểm tra tab Xem Trước rồi lưu bản nháp nếu muốn dùng lịch này.`,
      });
      setActiveTab("preview");
      window.setTimeout(() => {
        bodyScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }, 0);
    } catch (err) {
      console.error("Error generating schedule:", err);
      setGenerationNotice({
        type: "error",
        message:
          "Lỗi tạo lịch: " + (err.response?.data?.message || err.message),
      });
      alert("Lỗi tạo lịch: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePublishDraft = async (draftId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `http://localhost:5000/api/schedules/publish`,
        { schedule_id: draftId },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      alert("Lịch đã được công bố");
      fetchDrafts();
    } catch (err) {
      alert("Lỗi: " + (err.response?.data?.message || err.message));
    }
  };

  const handleDeleteDraft = async (draftId) => {
    if (confirm("Bạn chắc chắn muốn xóa bản nháp này?")) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(
          `http://localhost:5000/api/schedules/draft/${draftId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        fetchDrafts();
      } catch (err) {
        alert("Lỗi: " + (err.response?.data?.message || err.message));
      }
    }
  };

  const handleSaveDraft = async () => {
    if (!draftName.trim()) {
      alert("Vui lòng nhập tên bản nháp");
      return;
    }

    if (!generatedSchedule) {
      alert("Chưa có lịch được tạo");
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const response = await axios.post(
        "http://localhost:5000/api/schedules/drafts",
        {
          name: draftName,
          month,
          year,
          shifts: generatedSchedule.generated_shifts.map((shift) => ({
            employee_id: shift.employee_id,
            shift_id: shift.shift_id,
            work_date: shift.work_date,
            role_id: shift.role_id || null,
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      alert("Đã lưu bản nháp: " + response.data.name);
      setDraftName("");
      fetchDrafts();
      onGenerate(response.data);
      handleClose();
    } catch (err) {
      console.error("Error saving draft:", err);
      alert(
        "Lỗi lưu bản nháp: " + (err.response?.data?.message || err.message),
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePublishGenerated = async () => {
    if (!generatedSchedule) {
      alert("Chưa có lịch được tạo");
      return;
    }

    if (!confirm("Công bố lịch này cho nhân viên?")) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const shiftsToPublish = generatedSchedule.generated_shifts.map((shift) => ({
        employee_id: shift.employee_id,
        shift_id: shift.shift_id,
        work_date: shift.work_date,
        role_id: shift.role_id || null,
        status: "PUBLISHED",
      }));

      await axios.post(
        "http://localhost:5000/api/schedules/publish",
        {
          month,
          year,
          shifts: shiftsToPublish,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      alert("Lịch đã được công bố");
      onGenerate?.(generatedSchedule);
      handleClose();
    } catch (err) {
      console.error("Error publishing generated schedule:", err);
      alert("Lỗi công bố: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const getPreviewRows = () => {
    if (!generatedSchedule?.generated_shifts) return [];

    return [...generatedSchedule.generated_shifts]
      .sort((a, b) => {
        const dateCompare = String(a.work_date).localeCompare(String(b.work_date));
        if (dateCompare !== 0) return dateCompare;
        return String(a.start_time || "").localeCompare(String(b.start_time || ""));
      })
      .map((shift) => ({
        date: new Date(shift.work_date).toLocaleDateString("vi-VN"),
        shift: shift.shift_name,
        time: `${shift.start_time || ""} - ${shift.end_time || ""}`,
        employee: shift.employee_name,
        role: shift.role_name || (shift.role_id ? `Vai trò #${shift.role_id}` : "-"),
      }));
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Tab" || !open || !dialogRef.current) return;

    const focusableElements = dialogRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (e.shiftKey) {
      if (activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [open]);

  const handleClose = () => {
    if (loading) {
      return;
    }
    const mainContent =
      document.querySelector("main") || document.querySelector("[role='main']");
    if (mainContent) {
      mainContent.inert = false;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      handler={() => {
        if (!loading) {
          handleClose();
        }
      }}
      size="xl"
      className="max-h-[90vh] overflow-y-auto focus:outline-none"
    >
      <div
        ref={(node) => {
          dialogRef.current = node;
          bodyScrollRef.current = node;
        }}
        className="max-h-[90vh] w-full overflow-y-auto rounded-lg bg-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* HEADER */}
        <div className="sticky top-0 z-20 flex justify-between items-center p-6 border-b border-gray-200 bg-white">
          <Typography id="modal-title" variant="h5">
            Tạo Lịch Tự Động
          </Typography>
          <button
            onClick={handleClose}
            disabled={loading}
            className={`text-2xl ${loading ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:text-gray-700"}`}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* BODY */}
        <div className="relative">
          {loading && (
            <div
              className="absolute inset-0 bg-white bg-opacity-95 flex items-center justify-center z-50 rounded-lg cursor-not-allowed"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-b from-blue-50 to-white p-10 rounded-xl shadow-2xl text-center border-2 border-blue-200">
                <Typography className="text-2xl font-bold mb-2 text-blue-700">
                  Đang xếp lịch...
                </Typography>
                <Typography className="text-gray-700 text-base mb-6">
                  Vui lòng chờ, không đóng cửa sổ
                </Typography>
                <div className="flex justify-center gap-2 mb-4">
                  <div
                    className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "0s" }}
                  ></div>
                  <div
                    className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                  <div
                    className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "0.4s" }}
                  ></div>
                </div>
                <Typography className="text-xs text-gray-500">
                  Quá trình có thể mất vài giây...
                </Typography>
              </div>
            </div>
          )}
          <Tabs
            value={activeTab}
            className={loading ? "opacity-30" : ""}
          >
            <div className="bg-white border-b border-gray-200 px-6">
              <TabsHeader>
                <Tab
                  value="setup"
                  onClick={() => !loading && setActiveTab("setup")}
                  disabled={loading}
                  className={loading ? "opacity-50 cursor-not-allowed" : ""}
                >
                  Cấu Hình
                </Tab>
                <Tab
                  value="preview"
                  onClick={() => !loading && setActiveTab("preview")}
                  disabled={loading}
                  className={loading ? "opacity-50 cursor-not-allowed" : ""}
                >
                  Xem Trước
                </Tab>
                <Tab
                  value="saved"
                  onClick={() => !loading && setActiveTab("saved")}
                  disabled={loading}
                  className={loading ? "opacity-50 cursor-not-allowed" : ""}
                >
                  Bản Nháp ({drafts.length})
                </Tab>
              </TabsHeader>
            </div>

            <div className="px-6 py-4">
              {generationNotice && (
                <div
                  className={`mb-4 rounded border p-3 text-sm ${
                    generationNotice.type === "success"
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                  role="status"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span>{generationNotice.message}</span>
                    <button
                      type="button"
                      onClick={() => setGenerationNotice(null)}
                      className="text-lg leading-none opacity-70 hover:opacity-100"
                      aria-label="Dong thong bao"
                    >
                      x
                    </button>
                  </div>
                </div>
              )}
              <TabsBody>
                <TabPanel value="setup" className="space-y-4 py-0">
                  {/* Month/Year Selector + Quick Increase Button */}
                  <div className="grid grid-cols-3 gap-4">
                    <Select
                      label="Tháng"
                      value={String(month)}
                      onChange={(v) => setMonth(Number(v))}
                    >
                      {[...Array(12)].map((_, i) => (
                        <Option key={i + 1} value={String(i + 1)}>
                          Tháng {i + 1}
                        </Option>
                      ))}
                    </Select>

                    <Select
                      label="Năm"
                      value={String(year)}
                      onChange={(v) => setYear(Number(v))}
                    >
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <Option key={y} value={String(y)}>
                          {y}
                        </Option>
                      ))}
                    </Select>

                    <div className="flex items-end">
                      <Button
                        size="sm"
                        variant="filled"
                        fullWidth
                        onClick={() => {
                          if (configMode === "general") {
                            setGeneralConfig((prev) => {
                              const updated = { ...prev };
                              DAYS_OF_WEEK.forEach((_, dayIndex) => {
                                updated[dayIndex] = { ...prev[dayIndex] };
                                shifts.forEach((shift) => {
                                  updated[dayIndex][shift.shift_id] =
                                    (prev[dayIndex]?.[shift.shift_id] || 0) + 1;
                                });
                              });
                              return updated;
                            });
                          } else {
                            setDetailedConfig((prev) => {
                              const updated = { ...prev };
                              Object.keys(prev).forEach((dateStr) => {
                                updated[dateStr] = { ...prev[dateStr] };
                                shifts.forEach((shift) => {
                                  updated[dateStr][shift.shift_id] =
                                    (prev[dateStr]?.[shift.shift_id] || 0) + 1;
                                });
                              });
                              return updated;
                            });
                          }
                        }}
                        className="bg-green-600 text-white"
                      >
                        +1
                      </Button>
                    </div>
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex justify-between items-center p-2 py-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                      <Typography className="text-sm font-semibold">
                        {configMode === "general" ? "Chung" : "Chi tiết"}
                      </Typography>
                    </div>
                    <Switch
                      checked={configMode === "detailed"}
                      onChange={(e) =>
                        handleModeToggle(
                          e.target.checked ? "detailed" : "general",
                        )
                      }
                      label={
                        configMode === "general" ? "→ Chi tiết" : "← Chung"
                      }
                    />
                  </div>

                  {roles.length > 0 && shifts.length > 0 && (
                    <div className="space-y-3">
                      <Typography variant="small" className="font-semibold">
                        Số lượng vai trò theo ca
                      </Typography>
                      <div className="overflow-x-auto border border-gray-200 rounded">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="border border-gray-300 p-2 text-left font-semibold">
                                Ca
                              </th>
                              {roles.map((role) => (
                                <th
                                  key={role.role_id}
                                  className="border border-gray-300 p-2 text-center font-semibold"
                                >
                                  {role.role_name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {shifts.map((shift) => (
                              <tr key={shift.shift_id} className="hover:bg-gray-50">
                                <td className="border border-gray-300 p-2 font-medium">
                                  <div>{shift.shift_name}</div>
                                  <div className="text-xs text-gray-600">
                                    {shift.start_time} - {shift.end_time}
                                  </div>
                                </td>
                                {roles.map((role) => (
                                  <td
                                    key={role.role_id}
                                    className="border border-gray-300 p-2 text-center"
                                  >
                                    <input
                                      type="number"
                                      min="0"
                                      value={
                                        roleRequirements[shift.shift_id]?.[
                                          role.role_id
                                        ] || 0
                                      }
                                      onChange={(e) =>
                                        setRoleRequirement(
                                          shift.shift_id,
                                          role.role_id,
                                          e.target.value,
                                        )
                                      }
                                      className="w-12 px-1 py-1 border border-gray-300 rounded text-center"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* GENERAL MODE */}
                  {configMode === "general" && (
                    <div className="space-y-3">
                      <Typography variant="small" className="font-semibold">
                        Cấu Hình Theo Tuần
                      </Typography>
                      <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-200 rounded">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-blue-50">
                              <th className="border border-gray-300 p-2 text-left font-semibold">
                                Ngày
                              </th>
                              {shifts.map((shift) => (
                                <th
                                  key={shift.shift_id}
                                  className="border border-gray-300 p-2 text-center font-semibold"
                                >
                                  <div className="text-xs">
                                    {shift.shift_name}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    {shift.start_time}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {DAYS_OF_WEEK.map((day, dayIndex) => (
                              <tr key={dayIndex} className="hover:bg-gray-50">
                                <td className="border border-gray-300 p-2 font-medium">
                                  {day}
                                </td>
                                {shifts.map((shift) => (
                                  <td
                                    key={shift.shift_id}
                                    className="border border-gray-300 p-2 text-center"
                                  >
                                    <input
                                      type="number"
                                      min="0"
                                      value={
                                        generalConfig[dayIndex]?.[
                                          shift.shift_id
                                        ] || 0
                                      }
                                      onChange={(e) =>
                                        setGeneralValue(
                                          dayIndex,
                                          shift.shift_id,
                                          e.target.value,
                                        )
                                      }
                                      className="w-12 px-1 py-1 border border-gray-300 rounded text-center"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DETAILED MODE */}
                  {configMode === "detailed" && (
                    <div className="space-y-3">
                      <Typography variant="small" className="font-semibold">
                        Cấu Hình Chi Tiết - Tháng {month}/{year}
                      </Typography>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full border-collapse text-xs bg-white">
                          <thead className="sticky top-0 bg-green-50">
                            <tr>
                              <th className="border border-gray-300 p-2 text-left font-semibold w-16">
                                Ngày
                              </th>
                              {shifts.map((shift) => (
                                <th
                                  key={shift.shift_id}
                                  className="border border-gray-300 p-2 text-center font-semibold min-w-16"
                                >
                                  <div className="text-xs">
                                    {shift.shift_name}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(detailedConfig)
                              .sort(([dateA], [dateB]) =>
                                dateA.localeCompare(dateB),
                              )
                              .map(([dateStr, dayConfig]) => {
                                const date = new Date(dateStr + "T00:00:00");
                                const isWeekend =
                                  date.getDay() === 0 || date.getDay() === 6;
                                const dayNum = date.getDate();

                                return (
                                  <tr
                                    key={dateStr}
                                    className={`${isWeekend ? "bg-yellow-50" : "hover:bg-gray-50"}`}
                                  >
                                    <td
                                      className={`border border-gray-300 p-2 font-medium ${isWeekend ? "text-orange-700" : ""}`}
                                    >
                                      {dayNum}
                                      <div className="text-xs text-gray-600">
                                        {DAYS_OF_WEEK[(date.getDay() + 6) % 7]}
                                      </div>
                                    </td>
                                    {shifts.map((shift) => (
                                      <td
                                        key={shift.shift_id}
                                        className="border border-gray-300 p-1 text-center"
                                      >
                                        <input
                                          type="number"
                                          min="0"
                                          value={dayConfig[shift.shift_id] || 0}
                                          onChange={(e) =>
                                            setDetailedValue(
                                              dateStr,
                                              shift.shift_id,
                                              e.target.value,
                                            )
                                          }
                                          className={`w-10 px-1 py-0.5 border border-gray-300 rounded text-center ${isWeekend ? "bg-yellow-100" : ""}`}
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </TabPanel>

                <TabPanel value="preview" className="py-0">
                  <div className="space-y-4">
                    {!generatedSchedule ? (
                      <div className="flex flex-col items-center justify-center py-12">
                        <Typography className="text-gray-500 text-lg">
                          Chưa có lịch được tạo
                        </Typography>
                        <Typography className="text-gray-400 text-sm mt-2">
                          Hãy cấu hình và nhấn "Tạo Lịch"
                        </Typography>
                      </div>
                    ) : (
                      <>
                        <Card
                          className={`p-4 ${parseFloat(generatedSchedule.stats?.fulfillment_rate) >= 90 ? "bg-green-50" : "bg-blue-50"}`}
                        >
                          <div className="space-y-2">
                            <Typography
                              className={`font-semibold ${parseFloat(generatedSchedule.stats?.fulfillment_rate) >= 90 ? "text-green-900" : "text-blue-900"}`}
                            >
                              Thống Kê Xếp Lịch
                            </Typography>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <Typography className="text-xs text-gray-600">
                                  Tổng ca
                                </Typography>
                                <Typography className="font-semibold text-lg">
                                  {generatedSchedule.generated_shifts.length}
                                </Typography>
                              </div>
                              <div>
                                <Typography className="text-xs text-gray-600">
                                  Nhân viên
                                </Typography>
                                <Typography className="font-semibold text-lg">
                                  {generatedSchedule.stats?.unique_employees}
                                </Typography>
                              </div>
                              <div>
                                <Typography className="text-xs text-gray-600">
                                  Ngày làm việc
                                </Typography>
                                <Typography className="font-semibold text-lg">
                                  {generatedSchedule.stats?.work_dates}
                                </Typography>
                              </div>
                              <div>
                                <Typography className="text-xs text-gray-600">
                                  Tỷ lệ đáp ứng
                                </Typography>
                                <Typography
                                  className={`font-semibold text-lg ${parseFloat(generatedSchedule.stats?.fulfillment_rate) >= 90 ? "text-green-600" : "text-orange-600"}`}
                                >
                                  {generatedSchedule.stats?.fulfillment_rate}%
                                </Typography>
                              </div>
                            </div>
                            {generatedSchedule.stats?.unfulfilled > 0 && (
                              <div className="mt-3 p-2 bg-yellow-100 rounded text-xs text-orange-800">
                                Có {generatedSchedule.stats?.unfulfilled} ca
                                không thể được xếp do không đủ nhân viên hoặc
                                ràng buộc.
                              </div>
                            )}
                            {generatedSchedule.stats?.role_unfulfilled > 0 && (
                              <div className="mt-3 p-2 bg-orange-100 rounded text-xs text-orange-900">
                                Con thieu {generatedSchedule.stats.role_unfulfilled} vi tri theo vai tro.
                              </div>
                            )}
                          </div>
                        </Card>

                        <div className="space-y-2">
                          <div className="flex flex-col gap-2 md:flex-row">
                            <Input
                              type="text"
                              placeholder="Tên bản nháp (vd: Tháng 12 - Phiên bản 1)"
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              label="Lưu bản nháp"
                            />
                            <Button
                              onClick={handleSaveDraft}
                              disabled={loading || !draftName.trim()}
                              className="bg-green-600 whitespace-nowrap"
                            >
                              {loading ? "..." : "Lưu"}
                            </Button>
                            <Button
                              onClick={handlePublishGenerated}
                              disabled={loading}
                              className="bg-blue-700 whitespace-nowrap"
                            >
                              Cong bo lich
                            </Button>
                          </div>
                        </div>

                        <Typography className="font-semibold text-sm">
                          Chi Tiết Lịch (
                          {generatedSchedule.generated_shifts.length})
                        </Typography>
                        <div className="max-h-96 overflow-auto border border-gray-200 rounded bg-white">
                          <table className="w-full min-w-[720px] border-collapse text-sm">
                            <thead className="sticky top-0 bg-gray-100">
                              <tr>
                                <th className="border border-gray-200 p-2 text-left">Ngay</th>
                                <th className="border border-gray-200 p-2 text-left">Ca</th>
                                <th className="border border-gray-200 p-2 text-left">Gio</th>
                                <th className="border border-gray-200 p-2 text-left">Nhan vien</th>
                                <th className="border border-gray-200 p-2 text-left">Vai tro</th>
                              </tr>
                            </thead>
                            <tbody>
                              {getPreviewRows().map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="border border-gray-200 p-2 font-medium">{row.date}</td>
                                  <td className="border border-gray-200 p-2">{row.shift}</td>
                                  <td className="border border-gray-200 p-2 font-mono text-xs">{row.time}</td>
                                  <td className="border border-gray-200 p-2">{row.employee}</td>
                                  <td className="border border-gray-200 p-2">{row.role}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </TabPanel>

                <TabPanel value="saved" className="py-0">
                  <div className="space-y-3">
                    <Button
                      onClick={() => setShowDraftModal(true)}
                      className="w-full bg-blue-600"
                    >
                      Xem Tất Cả Bản Nháp Đã Lưu
                    </Button>

                    {drafts.length === 0 ? (
                      <Typography className="text-center text-gray-500 py-8">
                        Không có bản nháp nào
                      </Typography>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-2">
                        {drafts.map((draft) => (
                          <Card
                            key={draft.schedule_id}
                            className="p-3 flex justify-between items-center hover:shadow-md transition"
                          >
                            <div>
                              <Typography className="font-medium">
                                {draft.employee_name} - {draft.shift_name}
                              </Typography>
                              <Typography className="text-xs text-gray-600">
                                {new Date(draft.work_date).toLocaleDateString(
                                  "vi-VN",
                                )}
                              </Typography>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outlined"
                                onClick={() =>
                                  handlePublishDraft(draft.schedule_id)
                                }
                              >
                                Công Bố
                              </Button>
                              <Button
                                size="sm"
                                color="red"
                                variant="outlined"
                                onClick={() =>
                                  handleDeleteDraft(draft.schedule_id)
                                }
                              >
                                Xóa
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </TabPanel>
              </TabsBody>
            </div>
          </Tabs>
        </div>

        {/* FOOTER */}
        <div className="flex gap-3 justify-between p-6 border-t border-gray-200 bg-gray-50">
          <Button
            size="sm"
            variant="outlined"
            onClick={() => setShowDraftModal(true)}
            disabled={loading}
          >
            Xem Bản Nháp
          </Button>

          <div className="flex gap-3">
            <Button
              size="sm"
              variant="text"
              onClick={handleReset}
              disabled={loading}
              className="text-orange-600"
            >
              Đặt Lại
            </Button>
            <Button
              size="sm"
              variant="outlined"
              onClick={handleClose}
              disabled={loading}
            >
              Đóng
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className={`${loading ? "bg-gray-400" : "bg-blue-600"}`}
            >
              {loading ? "Đang tạo..." : "Tạo Lịch"}
            </Button>
          </div>
        </div>
      </div>

      <DraftSchedulesModal
        open={showDraftModal}
        onClose={() => setShowDraftModal(false)}
      />
    </Dialog>
  );
}
