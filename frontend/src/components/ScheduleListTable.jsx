import { Card, Typography } from "@material-tailwind/react";

export default function ScheduleListTable({
  schedules,
  onEdit,
  onDelete,
  selectedScheduleIds = [],
  onToggleSchedule,
  onToggleAllSchedules,
}) {
  if (schedules.length === 0) {
    return (
      <Card className="p-8 bg-white rounded-xl shadow text-center">
        <Typography color="gray" className="text-lg">
          Không có lịch làm nào. Hãy thêm ca làm mới.
        </Typography>
      </Card>
    );
  }

  const visibleScheduleIds = schedules.map((schedule) => schedule.schedule_id);
  const selectedVisibleCount = selectedScheduleIds.filter((id) =>
    visibleScheduleIds.includes(id),
  ).length;
  const allVisibleSelected =
    visibleScheduleIds.length > 0 &&
    selectedVisibleCount === visibleScheduleIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleScheduleIds.length;

  return (
    <Card className="overflow-hidden bg-white rounded-xl shadow">
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full table-auto">
          <thead className="sticky top-0 z-10 bg-blue-50 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-center font-bold text-gray-700">
                <input
                  type="checkbox"
                  aria-label="Chon tat ca ca dang hien thi"
                  checked={allVisibleSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someVisibleSelected;
                  }}
                  onChange={onToggleAllSchedules}
                  className="h-4 w-4 cursor-pointer accent-blue-600"
                />
              </th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">
                Ngày
              </th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">
                Ca làm
              </th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">
                Nhân viên
              </th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">
                Giờ bắt đầu
              </th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">
                Giờ kết thúc
              </th>
              <th className="px-4 py-3 text-left font-bold text-gray-700">
                Trạng thái
              </th>
              <th className="px-4 py-3 text-center font-bold text-gray-700">
                Hành động
              </th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr
                key={schedule.schedule_id}
                className="border-b hover:bg-gray-50 transition"
              >
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Chon ca ${schedule.schedule_id}`}
                    checked={selectedScheduleIds.includes(schedule.schedule_id)}
                    onChange={() => onToggleSchedule(schedule.schedule_id)}
                    className="h-4 w-4 cursor-pointer accent-blue-600"
                  />
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {schedule.work_date}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {schedule.shift_name}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {schedule.employee_name}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {schedule.start_time}
                </td>
                <td className="px-4 py-3 text-gray-700">{schedule.end_time}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      schedule.status === "PUBLISHED"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {schedule.status === "PUBLISHED" ? "Công bố" : "Nháp"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-2 justify-center">
                    <button
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold"
                      onClick={() => onEdit(schedule)}
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold"
                      onClick={() => onDelete(schedule.schedule_id)}
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
