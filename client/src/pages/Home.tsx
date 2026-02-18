import { Button } from "@/components/ui/button";

export default function Home() {
  const handleClick = () => {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance("כאן השועל. המערכת ב-אדג' פועלת. אריסטו, אני ממתין להוראות חדשות.");
    msg.lang = "he-IL";
    msg.rate = 0.9;
    window.speechSynthesis.speak(msg);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <Button
        size="lg"
        onClick={handleClick}
        data-testid="button-test"
      >
        בדיקה
      </Button>
    </div>
  );
}
