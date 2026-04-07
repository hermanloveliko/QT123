import App from "../App";

/** 独立路由 /admin：与主站共用同一套后台（内嵌 AdminPage） */
export default function AdminApp() {
  return <App initialPage="admin" />;
}
