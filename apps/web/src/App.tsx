import { AdminApp } from "./admin";
import { ResidentApp } from "./resident";

export function App() {
  const path = window.location.pathname;
  if (path === "/admin" || path.startsWith("/admin/")) {
    return <AdminApp path={path} />;
  }
  return <ResidentApp path={path} />;
}
