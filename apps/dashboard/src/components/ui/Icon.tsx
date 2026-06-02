/**
 * Thin re-export wrapper around lucide-react so callers import a single name
 * (`<Icon name="bucket" />`) the way the console kit does. Forwarding the
 * lucide component directly lets TypeScript yell at missing icon names at
 * compile time.
 *
 * Design system rule: 1.5px stroke, currentColor, 16px in dense rows,
 * 20px in nav and buttons, 24px in feature blocks. Don't override the
 * stroke width.
 */

import {
  ArrowUpRight,
  Brain,
  Container as BucketIcon,
  ChartLine,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Database,
  Download,
  File,
  FileCode2,
  FileText,
  Folder,
  FolderPlus,
  Hash,
  Image as ImageIcon,
  Info,
  Inbox,
  Key,
  Link as LinkIcon,
  Link2,
  Lock,
  LogOut,
  MoreVertical,
  Plus,
  Search,
  Settings,
  ShieldOff,
  TriangleAlert,
  Trash2,
  Upload,
  Unlock,
  X,
  type LucideProps,
} from "lucide-react";

const REGISTRY = {
  brain: Brain,
  bucket: BucketIcon,
  chart: ChartLine,
  check: Check,
  chevron: ChevronRight,
  chevronDown: ChevronDown,
  clock: Clock,
  copy: Copy,
  "credit-card": CreditCard,
  database: Database,
  download: Download,
  file: File,
  code: FileCode2,
  text: FileText,
  folder: Folder,
  "folder-plus": FolderPlus,
  hash: Hash,
  image: ImageIcon,
  inbox: Inbox,
  info: Info,
  key: Key,
  link: LinkIcon,
  "link-2": Link2,
  lock: Lock,
  unlock: Unlock,
  logOut: LogOut,
  moreVertical: MoreVertical,
  plus: Plus,
  search: Search,
  settings: Settings,
  shieldOff: ShieldOff,
  alert: TriangleAlert,
  trash: Trash2,
  upload: Upload,
  x: X,
  "arrow-up-right": ArrowUpRight,
} as const;

export type IconName = keyof typeof REGISTRY;

interface Props extends Omit<LucideProps, "size" | "ref"> {
  name: IconName;
  size?: 14 | 16 | 20 | 24;
}

export function Icon({ name, size = 16, strokeWidth = 1.5, ...rest }: Props) {
  const Cmp = REGISTRY[name];
  return <Cmp size={size} strokeWidth={strokeWidth} {...rest} />;
}
