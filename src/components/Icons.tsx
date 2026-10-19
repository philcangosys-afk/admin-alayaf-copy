/** أيقونات خطية بسيطة (بلا مكتبة خارجية) */
type IconProps = { className?: string };

const svg = (paths: JSX.Element) =>
  function Icon({ className }: IconProps) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {paths}
      </svg>
    );
  };

export const HomeIcon = svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>);
export const BuildingIcon = svg(<><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></>);
export const CrownIcon = svg(<><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" /></>);
export const InboxIcon = svg(<><path d="M3 13l3-8h12l3 8" /><path d="M3 13v6h18v-6h-5a4 4 0 0 1-8 0H3Z" /></>);
export const ReceiptIcon = svg(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>);
export const LayersIcon = svg(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>);
export const MegaphoneIcon = svg(<><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" /><path d="M17 9a4 4 0 0 1 0 6" /></>);
export const SettingsIcon = svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const ScrollIcon = svg(<><path d="M8 21h11a2 2 0 0 0 2-2v-1H10v1a2 2 0 0 1-4 0V5a2 2 0 0 0-2-2h11a2 2 0 0 1 2 2v13" /><path d="M10 8h5M10 12h5" /></>);
export const RefreshIcon = svg(<><path d="M20 11a8 8 0 0 0-14.9-3.9L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.9 3.9L20 15" /><path d="M20 20v-5h-5" /></>);
export const PlusIcon = svg(<><path d="M12 5v14M5 12h14" /></>);
export const MenuIcon = svg(<><path d="M4 6h16M4 12h16M4 18h16" /></>);
export const PrinterIcon = svg(<><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="1.5" /><path d="M7 14h10v7H7z" /></>);
export const ClockIcon = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const CalendarPlusIcon = svg(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18M12 13v5M9.5 15.5h5" /></>);
export const SwapIcon = svg(<><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>);
export const CheckCircleIcon = svg(<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>);
export const LockIcon = svg(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const GiftIcon = svg(<><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13" /><path d="M12 8S10.5 3 8 4s-.5 4 4 4ZM12 8s1.5-5 4-4 .5 4-4 4Z" /></>);
export const BanIcon = svg(<><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>);
export const CoinsIcon = svg(<><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M15 11.5c3.3 0 6 1.3 6 3v4c0 1.7-2.7 3-6 3-2 0-3.8-.5-4.9-1.3" /></>);
export const AlertIcon = svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>);
export const FileIcon = svg(<><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></>);

/** شعار المنصة: نجمة ثمانية (نفس رمز صفحات الدخول) */
export function BrandMark({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="10" fill="#127a5a" />
      <g transform="translate(20 20)" fill="none" stroke="#c9a24d" strokeWidth="1.8">
        <rect x="-8.5" y="-8.5" width="17" height="17" />
        <rect x="-8.5" y="-8.5" width="17" height="17" transform="rotate(45)" />
      </g>
      <circle cx="20" cy="20" r="3" fill="#f6efd9" />
    </svg>
  );
}
