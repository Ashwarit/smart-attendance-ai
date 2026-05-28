import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HR Attendance Intelligence" },
      { name: "description", content: "Live attendance dashboard with late-arrival tracking and three-strike warnings." },
      { property: "og:title", content: "HR Attendance Intelligence" },
      { property: "og:description", content: "Live attendance dashboard with late-arrival tracking and three-strike warnings." },
    ],
  }),
  component: Dashboard,
});
