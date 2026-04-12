import { useState, useRef } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { useAuth } from "@/hooks/use-auth";
import { FeatureTip } from "@/components/ui/feature-tip";
import { ExportButton } from "@/components/ui/export-button";
import { Button } from "@/components/ui/button";
import { Phone, Upload, FileUp, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface CsvRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tags: string;
  notes: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// Common header aliases for column mapping
const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ["first name", "firstname", "first_name", "first", "fname"],
  lastName: ["last name", "lastname", "last_name", "last", "lname", "surname"],
  email: ["email", "email address", "e-mail", "emailaddress"],
  phone: ["phone", "phone number", "phonenumber", "phone_number", "mobile", "cell", "telephone", "tel"],
  tags: ["tags", "tag", "labels", "label", "category"],
  notes: ["notes", "note", "comments", "comment", "description"],
};

function autoMapColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

export default function Customers() {
  const { user } = useAuth();
  const businessId = user?.businessId;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, number | null>>({
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    tags: null,
    notes: null,
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");

  const importMutation = useMutation({
    mutationFn: async (customers: CsvRow[]) => {
      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customers }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/customers/enriched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      if (data.imported > 0) {
        toast({
          title: "Import complete",
          description: `${data.imported} customer${data.imported !== 1 ? "s" : ""} imported successfully.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCsv(text);

      if (headers.length === 0 || rows.length === 0) {
        toast({
          title: "Invalid file",
          description: "The CSV file appears to be empty or has no data rows.",
          variant: "destructive",
        });
        return;
      }

      setCsvHeaders(headers);
      setCsvRows(rows);

      // Auto-map columns based on header names
      const newMap: Record<string, number | null> = {
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        tags: null,
        notes: null,
      };

      headers.forEach((h, i) => {
        const mapped = autoMapColumn(h);
        if (mapped && newMap[mapped] === null) {
          newMap[mapped] = i;
        }
      });

      setColumnMap(newMap);
      setStep("map");
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const handleImport = () => {
    if (columnMap.firstName === null || columnMap.lastName === null || columnMap.phone === null) {
      toast({
        title: "Missing required columns",
        description: "Please map First Name, Last Name, and Phone columns.",
        variant: "destructive",
      });
      return;
    }

    const customers: CsvRow[] = csvRows
      .filter((row) => row.length > 0 && row.some((cell) => cell.trim()))
      .map((row) => ({
        firstName: (columnMap.firstName !== null ? row[columnMap.firstName] : "") || "",
        lastName: (columnMap.lastName !== null ? row[columnMap.lastName] : "") || "",
        email: (columnMap.email !== null ? row[columnMap.email] : "") || "",
        phone: (columnMap.phone !== null ? row[columnMap.phone] : "") || "",
        tags: (columnMap.tags !== null ? row[columnMap.tags] : "") || "",
        notes: (columnMap.notes !== null ? row[columnMap.notes] : "") || "",
      }))
      .filter((c) => c.firstName.trim() && c.lastName.trim() && c.phone.trim());

    if (customers.length === 0) {
      toast({
        title: "No valid rows",
        description: "No rows have the required fields (First Name, Last Name, Phone).",
        variant: "destructive",
      });
      return;
    }

    importMutation.mutate(customers);
  };

  const resetImport = () => {
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({ firstName: null, lastName: null, email: null, phone: null, tags: null, notes: null });
    setImportResult(null);
    setStep("upload");
  };

  const closeDialog = () => {
    setImportOpen(false);
    resetImport();
  };

  const REQUIRED_FIELDS = ["firstName", "lastName", "phone"];
  const FIELD_LABELS: Record<string, string> = {
    firstName: "First Name *",
    lastName: "Last Name *",
    email: "Email",
    phone: "Phone *",
    tags: "Tags",
    notes: "Notes",
  };

  return (
    <PageLayout title="Customers">
      <div className="space-y-6">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <ExportButton endpoint="/api/export/customers" filename="customers.csv" />
        </div>
        <FeatureTip
          tipId="customers-auto-add"
          title="Customers are added automatically"
          description="When someone calls your AI receptionist or books online, they're automatically added here. You can also add customers manually."
          icon={Phone}
        />
        <CustomerTable businessId={businessId} />
      </div>

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === "upload" && "Import Customers from CSV"}
              {step === "map" && "Map CSV Columns"}
              {step === "result" && "Import Results"}
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: File Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with customer data. The first row should contain column headers.
              </p>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .csv files with headers like First Name, Last Name, Phone, Email
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}

          {/* Step 2: Column Mapping + Preview */}
          {step === "map" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Map your CSV columns to customer fields. Fields marked with * are required.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                  <div key={field}>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {label}
                    </label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={columnMap[field] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setColumnMap((prev) => ({
                          ...prev,
                          [field]: val === "" ? null : parseInt(val),
                        }));
                      }}
                    >
                      <option value="">-- Skip --</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview first 5 rows */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Preview (first {Math.min(5, csvRows.length)} of {csvRows.length} rows)
                </p>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-2 py-1.5 text-left font-medium">First Name</th>
                        <th className="px-2 py-1.5 text-left font-medium">Last Name</th>
                        <th className="px-2 py-1.5 text-left font-medium">Phone</th>
                        <th className="px-2 py-1.5 text-left font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5">{columnMap.firstName !== null ? row[columnMap.firstName] || "" : "--"}</td>
                          <td className="px-2 py-1.5">{columnMap.lastName !== null ? row[columnMap.lastName] || "" : "--"}</td>
                          <td className="px-2 py-1.5">{columnMap.phone !== null ? row[columnMap.phone] || "" : "--"}</td>
                          <td className="px-2 py-1.5">{columnMap.email !== null ? row[columnMap.email] || "" : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetImport}>Back</Button>
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || REQUIRED_FIELDS.some((f) => columnMap[f] === null)}
                >
                  {importMutation.isPending ? "Importing..." : `Import ${csvRows.length} Rows`}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Results */}
          {step === "result" && importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
                  <div className="text-2xl font-bold">{importResult.imported}</div>
                  <div className="text-xs text-muted-foreground">Imported</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <AlertCircle className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
                  <div className="text-2xl font-bold">{importResult.skipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <AlertCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
                  <div className="text-2xl font-bold">{importResult.errors.length}</div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Error details:</p>
                  <div className="max-h-48 overflow-y-auto border rounded-md">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 sticky top-0">
                          <th className="px-2 py-1.5 text-left font-medium">Row</th>
                          <th className="px-2 py-1.5 text-left font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.errors.map((err, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5">{err.row}</td>
                            <td className="px-2 py-1.5 text-red-600">{err.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button onClick={closeDialog}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
