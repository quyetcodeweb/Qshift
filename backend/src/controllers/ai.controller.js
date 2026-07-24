import {
  analyzeSchedule,
  answerEmployeeChat,
  answerManagerChat,
} from "../services/ai.service.js";

export async function analyzeScheduleController(req, res) {
  try {
    const result = await analyzeSchedule({
      month: req.body?.month || req.query?.month || "all",
      year: req.body?.year || req.query?.year || "all",
    });
    res.json(result);
  } catch (error) {
    console.error("[ai.analyzeSchedule]", error);
    res.status(500).json({ message: error.message });
  }
}

export async function managerChatController(req, res) {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }

    const result = await answerManagerChat({
      message,
      history: Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [],
      month: req.body?.month || "all",
      year: req.body?.year || "all",
      user: req.user,
    });
    res.json(result);
  } catch (error) {
    console.error("[ai.managerChat]", error);
    res.status(500).json({ message: error.message });
  }
}

export async function employeeChatController(req, res) {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }

    const result = await answerEmployeeChat({ message, user: req.user });
    res.json(result);
  } catch (error) {
    console.error("[ai.employeeChat]", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}
