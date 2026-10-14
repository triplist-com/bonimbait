'use client';

/** Interactive demos for the style guide (overlays, tabs, toast, tooltip). */
import { useState } from 'react';
import { Bell, Info, PanelRight, Sparkles, SquareArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Dialog, Drawer, Sheet } from '@/components/ui/Dialog';
import { Tabs } from '@/components/ui/Tabs';
import { Tooltip } from '@/components/ui/Tooltip';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

export function OverlayDemos() {
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setDialog(true)} iconStart={<SquareArrowUp />}>
        Dialog
      </Button>
      <Button variant="outline" onClick={() => setSheet(true)} iconStart={<PanelRight />}>
        Sheet
      </Button>
      <Button variant="outline" onClick={() => setDrawer(true)}>
        Drawer
      </Button>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="שמירת הפרויקט"
        description="Dialog: מלכודת פוקוס, Escape, לחיצה על הרקע, נעילת גלילה והחזרת פוקוס."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(false)}>
              ביטול
            </Button>
            <Button onClick={() => setDialog(false)}>שמירה</Button>
          </div>
        }
      >
        <Field label="שם הפרויקט" hint="למשל: הבית בחריש">
          <Input placeholder="הבית שלנו" />
        </Field>
      </Dialog>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="סינון בעלי מקצוע" side="end">
        <p className="text-body text-ink-600">Sheet: פאנל צד. בצד הסוף (שמאל ב-RTL), כמו כפתור התפריט.</p>
      </Sheet>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="פעולות מהירות" description="Drawer: גיליון תחתון לטלפונים.">
        <div className="grid gap-2">
          <Button variant="outline" fullWidth onClick={() => setDrawer(false)}>
            שמירה לרשימה
          </Button>
          <Button variant="outline" fullWidth onClick={() => setDrawer(false)}>
            שיתוף
          </Button>
        </div>
      </Drawer>
    </div>
  );
}

export function TabsDemo() {
  return (
    <div className="space-y-8">
      <Tabs
        label="סוג תוכן (pill)"
        tabs={[
          { id: 'videos', label: 'סרטונים', count: 178, content: <p className="text-body text-ink-600">תוכן לשונית הסרטונים.</p> },
          { id: 'podcast', label: 'פודקאסט', count: 112, content: <p className="text-body text-ink-600">תוכן לשונית הפודקאסט.</p> },
          { id: 'guides', label: 'מדריכים', content: <p className="text-body text-ink-600">תוכן לשונית המדריכים.</p> },
        ]}
      />
      <Tabs
        variant="underline"
        label="פרופיל עסק (underline)"
        tabs={[
          { id: 'about', label: 'אודות', content: <p className="text-body text-ink-600">אודות העסק.</p> },
          { id: 'reviews', label: 'חוות דעת', count: 6, content: <p className="text-body text-ink-600">חוות הדעת.</p> },
          { id: 'gallery', label: 'גלריה', content: <p className="text-body text-ink-600">הגלריה.</p> },
        ]}
      />
    </div>
  );
}

function ToastButtons() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" iconStart={<Bell />} onClick={() => toast({ title: 'נשמר', description: 'הסרטון נוסף לרשימה שלכם.', tone: 'success' })}>
        Toast הצלחה
      </Button>
      <Button variant="outline" onClick={() => toast({ title: 'משהו השתבש', description: 'נסו שוב בעוד רגע.', tone: 'error' })}>
        Toast שגיאה
      </Button>
      <Button variant="outline" onClick={() => toast({ title: 'עדכון', description: 'נוספו 3 סרטונים חדשים לשלב השלד.', tone: 'info' })}>
        Toast מידע
      </Button>
    </div>
  );
}

export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}

export function TooltipDemo() {
  return (
    <div className="flex items-center gap-4">
      <Tooltip content="מידע נוסף מופיע גם בריחוף וגם בפוקוס מקלדת">
        <IconButton label="מידע" icon={<Info />} variant="outline" round />
      </Tooltip>
      <Tooltip content="תשובה מהשטח, מתוך התוכן של בונים בית" side="bottom">
        <Button variant="ghost" iconStart={<Sparkles />}>
          ריחוף לתיאור
        </Button>
      </Tooltip>
    </div>
  );
}
