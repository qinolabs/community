import { getStatusStyle } from "~/ui/features/_shared/status-config";

interface StatusIndicatorProps {
  status: string | undefined;
}

function StatusIndicator({ status }: StatusIndicatorProps) {
  const style = getStatusStyle(status);
  return (
    <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.indicator}`} />
  );
}

export { StatusIndicator };
