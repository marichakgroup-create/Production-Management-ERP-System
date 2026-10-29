import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Archive,
  ArrowLeft,
  BookOpen,
  BuildingComplex,
  Calculator,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDollarSign,
  ClipboardList,
  Clock,
  Copy,
  Factory,
  FileClock,
  FileSpreadsheet,
  FolderOpen,
  GripVertical,
  Info,
  Landmark,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  List,
  ListChecks,
  ListFilter,
  Lock,
  LogOut,
  Palette,
  Pencil,
  Pin,
  Plus,
  Printer,
  Ruler,
  Scale,
  Search,
  Settings2,
  Shirt,
  SlidersHorizontal,
  StickyNote,
  Tags,
  Trash,
  TriangleAlert,
  Type,
  Users,
  Weight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type IconProps = LucideProps & { size?: number };

function icon(Icon: LucideIcon) {
  function Wrapped({ size = 18, className, strokeWidth = 1.75, ...props }: IconProps) {
    return (
      <Icon
        size={size}
        strokeWidth={strokeWidth}
        className={cn("shrink-0", className)}
        aria-hidden
        {...props}
      />
    );
  }
  Wrapped.displayName = Icon.displayName ?? Icon.name;
  return Wrapped;
}

/* Navigation / domain — Lucide (https://lucide.dev) */

export const IconOverview = icon(LayoutDashboard);
export const IconOrders = icon(ClipboardList);
export const IconClients = icon(BuildingComplex);
export const IconProducts = icon(Shirt);
export const IconGarment = icon(Shirt);
export const IconMaterials = icon(Layers);
export const IconOperations = icon(Settings2);
export const IconDecoration = icon(Palette);
export const IconPricing = icon(CircleDollarSign);
export const IconUsers = icon(Users);
export const IconCompany = icon(Landmark);
export const IconCalc = icon(Calculator);
export const IconVersions = icon(FileClock);
export const IconFiles = icon(FolderOpen);
export const IconQuote = icon(FileSpreadsheet);
export const IconSpec = icon(ListChecks);
export const IconHandover = icon(Factory);
export const IconSizes = icon(Ruler);

/* Actions / UI */

export const IconSearch = icon(Search);
export const IconPlus = icon(Plus);
export const IconFilter = icon(ListFilter);
export const IconClose = icon(X);
export const IconEdit = icon(Pencil);
export const IconArchive = icon(Archive);
export const IconCopy = icon(Copy);
export const IconPrint = icon(Printer);
export const IconTrash = icon(Trash);
export const IconPin = icon(Pin);
export const IconGrip = icon(GripVertical);
export const IconAlert = icon(TriangleAlert);
export const IconInfo = icon(Info);
export const IconCheck = icon(Check);
export const IconCheckCircle = icon(CircleCheck);
export const IconCircle = icon(Circle);
export const IconLock = icon(Lock);
export const IconChevronLeft = icon(ChevronLeft);
export const IconChevronRight = icon(ChevronRight);
export const IconChevronDown = icon(ChevronDown);
export const IconArrowLeft = icon(ArrowLeft);
export const IconGuide = icon(BookOpen);
export const IconLogout = icon(LogOut);
export const IconClock = icon(Clock);

/* Material form section markers */

export const IconFormTitle = icon(Type);
export const IconClassify = icon(Tags);
export const IconFabricKind = icon(Layers);
export const IconComposition = icon(ChartPie);
export const IconParams = icon(SlidersHorizontal);
export const IconPurchaseKg = icon(Weight);
export const IconMeterPrice = icon(Scale);
export const IconNote = icon(StickyNote);
export const IconRows = icon(List);
export const IconGrid = icon(LayoutGrid);
