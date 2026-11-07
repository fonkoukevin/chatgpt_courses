import type { ReactNode } from "react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function RootDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  const dictionary = getDictionary(locale);
  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main-content">{dictionary.skipLink}</a>
        {children}
      </body>
    </html>
  );
}
