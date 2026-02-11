import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  children: string;
}

function MarkdownContent({ children }: MarkdownContentProps) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none min-w-0 text-[15px] leading-[1.7] overflow-x-auto [&_pre]:overflow-x-auto">
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}

export { MarkdownContent };
