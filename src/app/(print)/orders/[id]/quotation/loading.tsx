import { DocumentGeneratingOverlay } from "@/components/print/GeneratingDocumentLink";

export default function QuotationLoading() {
  return <DocumentGeneratingOverlay usePortal={false} />;
}
