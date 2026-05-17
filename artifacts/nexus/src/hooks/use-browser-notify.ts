import { useCallback, useEffect, useRef } from "react";

export function useBrowserNotify() {
  const permissionRef = useRef<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    permissionRef.current = Notification.permission;
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    permissionRef.current = result;
    return result === "granted";
  }, []);

  const showNotification = useCallback(
    (
      title: string,
      options?: NotificationOptions & { onClick?: () => void; skipWhenVisible?: boolean },
    ) => {
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      if (options?.skipWhenVisible && document.visibilityState === "visible") return;

      const { onClick, skipWhenVisible: _skip, ...rest } = options ?? {};
      const n = new Notification(title, {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        ...rest,
      });
      n.onclick = () => {
        window.focus();
        onClick?.();
        n.close();
      };
      setTimeout(() => n.close(), 6000);
    },
    [],
  );

  return { requestPermission, showNotification, permission: permissionRef };
}
