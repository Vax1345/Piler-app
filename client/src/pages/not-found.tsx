import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-[100dvh] w-full bg-slate-50 px-4 py-14"
      data-testid="page-not-found"
    >
      <div className="mx-auto max-w-lg">
        <Card className="rounded-3xl">
          <CardContent className="pt-7">
            <div className="flex items-start gap-3" dir="rtl">
              <div
                className="grid h-10 w-10 place-items-center rounded-2xl bg-red-500/10 text-red-600"
                aria-hidden="true"
              >
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1
                  className="text-xl font-extrabold text-slate-900"
                  data-testid="text-404-title"
                >
                  404 — הדף לא נמצא
                </h1>
                <p
                  className="mt-2 text-sm leading-relaxed text-slate-600"
                  data-testid="text-404-sub"
                >
                  נראה שהקישור לא קיים. אם זו היתה כוונה לעמוד חדש — צריך להוסיף אותו
                  לראוטר.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
