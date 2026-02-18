import { RouterProvider, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@qinolabs/ui-core/components/theme";
import { Toaster } from "@qinolabs/ui-core/components/sonner";

import { queryClient, router } from "./router";
import { useWorkspaceEvents } from "./use-workspace-events";

function WorkspaceEventsProvider() {
  useWorkspaceEvents();
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceEventsProvider />
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RootLayout() {
  return (
    <>
      <main className="h-screen">
        <Outlet />
      </main>
      <Toaster />
    </>
  );
}

export { App, RootLayout };
