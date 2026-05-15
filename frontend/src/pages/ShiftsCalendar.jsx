import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import PreviewScheduleModal from "../components/PreviewScheduleModal";

export default function ShiftsCalendar() {
  const [events, setEvents] = useState([]);
  const [openPreviewModal, setOpenPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  // Fetch schedules on mount
  useEffect(() => {
    fetchSchedules();
  }, []);

  const transformToCalendarEvents = (schedules) => {
    return schedules
      .map((schedule) => {
        const {
          work_date,
          start_time,
          end_time,
          employee_name,
          shift_name,
          status,
        } = schedule;

        if (
          !work_date ||
          !start_time ||
          !end_time ||
          !employee_name ||
          !shift_name
        ) {
          console.warn("[transformToCalendarEvents] Missing required fields:", {
            work_date,
            start_time,
            end_time,
            employee_name,
            shift_name,
          });
          return null;
        }

        return {
          title: `${employee_name} - ${shift_name}`,
          start: `${work_date}T${start_time}`,
          end: `${work_date}T${end_time}`,
          backgroundColor: status === "PUBLISHED" ? "#10b981" : "#f59e0b",
          borderColor: status === "PUBLISHED" ? "#059669" : "#d97706",
          extendedProps: {
            status,
            employee_name,
            shift_name,
          },
        };
      })
      .filter(Boolean);
  };

  const fetchSchedules = async (date = new Date()) => {
    try {
      const token = localStorage.getItem("token");

      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      console.log("[fetchSchedules] Fetching for", { month, year });

      const res = await axios.get(
        `http://localhost:5000/api/schedules/current?month=${month}&year=${year}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("[fetchSchedules] Response:", {
        count: res.data?.length,
        sample: res.data?.[0],
      });

      const calendarEvents = transformToCalendarEvents(res.data);
      setEvents(calendarEvents);
    } catch (err) {
      console.error("[fetchSchedules] Error:", err);
      setEvents([]);
    }
  };

  const handleGenerateComplete = (data) => {
    console.log("[handleGenerateComplete] Generated schedule:", {
      month: data.month,
      year: data.year,
      shiftsCount: data.generated_shifts?.length,
    });

    setPreviewData(data);
    setOpenPreviewModal(true);
  };

  const handlePublishComplete = () => {
    alert("✅ Lịch đã được cập nhật thành công!");
    setOpenPreviewModal(false);

    setTimeout(() => {
      console.log("[handlePublishComplete] Refreshing calendar events");
      const currentDate = new Date();
      fetchSchedules(currentDate);
    }, 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow">
        <h1 className="text-2xl font-bold">📅 Lịch Làm Việc</h1>
      </div>

      {/* Calendar */}
      <div className="bg-white p-4 rounded-xl shadow">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          height="80vh"
          eventDisplay="block"
          datesSet={(arg) => {
            const year = arg.view.currentStart.getFullYear();
            const month = arg.view.currentStart.getMonth() + 1;

            fetchSchedules(new Date(year, month - 1, 1));
          }}
        />
      </div>

      {/* Modals */}
      <PreviewScheduleModal
        open={openPreviewModal}
        onClose={() => setOpenPreviewModal(false)}
        schedule={previewData}
        onPublish={handlePublishComplete}
      />
    </div>
  );
}
