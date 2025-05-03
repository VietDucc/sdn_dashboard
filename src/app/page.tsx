
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.push("/dashboard"); // Nếu đã đăng nhập, chuyển sang dashboard
    } else {
      router.push("/login"); // Nếu chưa đăng nhập, chuyển sang login
    }
  }, []);

  return null; // hoặc hiển thị spinner nếu muốn
}
