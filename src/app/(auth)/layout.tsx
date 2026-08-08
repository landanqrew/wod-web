import { LogoMark } from "@/components/shell/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-app px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-3">
          <LogoMark size={38} />
          <div>
            <p className="text-lg font-extrabold tracking-tight">WOD Assistant</p>
            <p className="text-xs text-subtle">
              Programming that respects your body&apos;s constraints
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
