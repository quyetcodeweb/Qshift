import * as service from "../services/availability.service.js";
import db from "../config/db.js";
export const saveAvailability = async (req, res) => {
  try {
    await service.save(req.body);
    res.json({ message: "Saved" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAvailability = async (req, res) => {
  try {
    const { employee_id } = req.params;
    const { month, year } = req.query;

    console.log(`📥 GET availability: employee_id=${employee_id}, month=${month}, year=${year}`);

    const data = await service.get(employee_id, month, year);
    
    console.log(`✅ GET availability response: ${data.length} records`);
    console.log("Response data:", data);
    
    res.json(data);
  } catch (err) {
    console.error("❌ GET availability error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const requestAvailability = async (req, res) => {
  try {
    const user_id = req.user?.user_id; // JWT
    const { month, year, data = [] } = req.body;

    console.log("📤 Request availability:", { user_id, month, year, dataLen: data?.length });

    if (!user_id) {
      return res.status(400).json({ message: "user_id not found in token" });
    }

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required" });
    }

    const requestId = await service.requestAvailability(user_id, month, year, data);

    res.json({ message: "Request sent", request_id: requestId });
  } catch (err) {
    console.error("❌ requestAvailability error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user?.user_id;

    console.log(`✅ Approving request ${id} by user ${user_id}`);

    await service.approveRequest(id);

    console.log(`✅ Request ${id} approved successfully`);
    res.json({ message: "Approved" });
  } catch (err) {
    console.error(`❌ Approve error:`, err.message);
    res.status(500).json({ message: err.message });
  }
};

export const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user?.user_id;

    console.log(`❌ Rejecting request ${id} by user ${user_id}`);

    await service.rejectRequest(id);

    console.log(`✅ Request ${id} rejected successfully`);
    res.json({ message: "Rejected" });
  } catch (err) {
    console.error(`❌ Reject error:`, err.message);
    res.status(500).json({ message: err.message });
  }
};

export const getMyAvailabilityRequest = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { month, year } = req.query;

    if (!user_id) {
      return res.status(400).json({ message: "user_id not found in token" });
    }

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required" });
    }

    const request = await service.getMyAvailabilityRequest(
      user_id,
      Number(month),
      Number(year)
    );

    res.json(request || {});
  } catch (err) {
    console.error("Get my availability request error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const requestEditAvailability = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { month, year } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "user_id not found in token" });
    }

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required" });
    }

    const requestId = await service.requestEditAvailability(
      user_id,
      Number(month),
      Number(year)
    );

    res.json({ message: "Edit request sent", request_id: requestId });
  } catch (err) {
    console.error("Request edit availability error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const respondEditAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    await service.respondEditAvailability(id, action);

    res.json({ message: "Edit request handled" });
  } catch (err) {
    console.error("Respond edit availability error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const listAvailabilityRequests = async (req, res) => {
  try {
    const requests = await service.listAvailabilityRequests();
    res.json(requests);
  } catch (err) {
    console.error("List availability requests error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const remindAvailabilityRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await service.remindAvailabilityRequest(id);

    res.json({ message: "Reminder sent", ...result });
  } catch (err) {
    console.error("Remind availability request error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const deleteAvailabilityRequest = async (req, res) => {
  try {
    const { id } = req.params;

    await service.deleteAvailabilityRequest(id);

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete availability request error:", err.message);
    res.status(500).json({ message: err.message });
  }
};
