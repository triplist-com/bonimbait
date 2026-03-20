"use client";

import { useSession } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function AdminSidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/admin", label: "לוח בקרה" },
  ];

  return (
    <aside className="w-56 shrink-0 border-e border-gray-200 bg-white min-h-screen p-4">
      <h2 className="text-lg font-bold text-primary mb-6">ניהול</h2>
      <nav className="flex flex-col gap-1">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? "bg-primary-50 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      window.location.href = "/api/auth/signin";
    },
  });

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">טוען...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <AdminSidebar />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AdminGuard>{children}</AdminGuard>
    </SessionProvider>
  );
}
