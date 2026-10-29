import { DocumentGeneratingOverlay } from "@/components/print/GeneratingDocumentLink";

export default function SpecificationLoading() {
  return <DocumentGeneratingOverlay label="Генеруємо специфікацію…" usePortal={false} />;
}
