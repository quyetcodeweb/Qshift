import { useState } from "react";
import axios from "axios";
import { Card, Input, Button, Typography } from "@material-tailwind/react";
import { API_URL } from "../services/api";

export default function Login() {
  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await axios.post(
        `${API_URL}/auth/login`,
        form,
      );

      // 🔐 lưu token + user
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      // 👉 redirect về dashboard
      window.location.href = "/";
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Không đăng nhập được",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-8">
      <Card className="w-full max-w-sm p-6 shadow-lg">
        <Typography variant="h4" className="mb-6 text-center">
          Đăng nhập QShift
        </Typography>

        {/* 🔥 FORM để dùng Enter */}
        <form
          onSubmit={(e) => {
            e.preventDefault(); // ❗ không reload trang
            handleLogin();
          }}
        >
          {/* Username */}
          <div className="mb-4">
            <Input
              label="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>

          {/* Password */}
          <div className="mb-4">
            <Input
              type="password"
              label="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {/* Error */}
          {error && (
            <Typography color="red" className="mb-3 text-sm">
              {error}
            </Typography>
          )}

          {/* Button */}
          <Button
            type="submit"
            fullWidth
            disabled={loading || !form.username || !form.password}
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
