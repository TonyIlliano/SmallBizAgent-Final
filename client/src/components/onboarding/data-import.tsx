import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import Papa from 'papaparse';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUpload, Upload, FileSpreadsheet, Users, Briefcase, ChevronRight, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DataImportProps {
  businessId: number;
  onImportComplete: () => void;
}

export function DataImport({ businessId, onImportComplete }: DataImportProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('customers');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState<{
    success: number;
    failed: number;
    total: number;
    errors: string[];
  } | null>(null);
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    setUploadProgress(10);
    setUploadResults(null);
    
    try {
      // Determine the endpoint based on active tab
      const endpoint = activeTab === 'customers' 
        ? '/api/import/customers' 
        : activeTab === 'services' 
          ? '/api/import/services' 
          : '/api/import/appointments';
      
      // Parse CSV file
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          setUploadProgress(30);
          
          if (results.errors.length > 0) {
            setUploadResults({
              success: 0,
              failed: results.errors.length,
              total: results.errors.length,
              errors: results.errors.map(err => `Row ${err.row}: ${err.message}`)
            });
            setIsUploading(false);
            return;
          }
          
          // Send data to server
          try {
            setUploadProgress(50);
            const response = await apiRequest('POST', endpoint, {
              businessId,
              data: results.data
            });
            
            setUploadProgress(90);
            const importResults = await response.json();
            
            setUploadResults({
              success: importResults.success || 0,
              failed: importResults.failed || 0,
              total: results.data.length,
              errors: importResults.errors || []
            });
            
            toast({
              title: 'Import completed',
              description: `Successfully imported ${importResults.success} ${activeTab} records.`,
            });
          } catch (error: any) {
            setUploadResults({
              success: 0,
              failed: results.data.length,
              total: results.data.length,
              errors: [error.message || 'Failed to import data']
            });
            
            toast({
              title: 'Import failed',
              description: error.message || 'An error occurred during import',
              variant: 'destructive',
            });
          }
          
          setUploadProgress(100);
          setIsUploading(false);
        },
        error: (error) => {
          setUploadResults({
            success: 0,
            failed: 1,
            total: 1,
            errors: [error.message]
          });
          setIsUploading(false);
          
          toast({
            title: 'File parsing failed',
            description: error.message,
            variant: 'destructive',
          });
        }
      });
    } catch (error: any) {
      setUploadResults({
        success: 0,
        failed: 1,
        total: 1,
        errors: [error.message || 'Unknown error']
      });
      setIsUploading(false);
      
      toast({
        title: 'Upload failed',
        description: error.message || 'An unknown error occurred',
        variant: 'destructive',
      });
    }
  };
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setUploadResults(null);
  };
  
  const getTemplateLink = () => {
    switch (activeTab) {
      case 'customers':
        return '/templates/customer-import-template.csv';
      case 'services':
        return '/templates/service-import-template.csv';
      case 'appointments':
        return '/templates/appointment-import-template.csv';
      default:
        return '#';
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Your Data</CardTitle>
        <CardDescription>
          Import your existing business data to quickly set up your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Customers</span>
            </TabsTrigger>
            <TabsTrigger value="services" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Services</span>
            </TabsTrigger>
            <TabsTrigger value="appointments" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Appointments</span>
            </TabsTrigger>
          </TabsList>
          
          <div className="mt-6">
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 text-center">
              {isUploading ? (
                <div className="w-full space-y-4">
                  <div className="flex items-center justify-center">
                    <FileUpload className="h-12 w-12 text-muted-foreground animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-medium">Processing your file...</h3>
                    <p className="text-sm text-muted-foreground">This may take a moment depending on file size.</p>
                  </div>
                  <Progress value={uploadProgress} className="h-2 w-full max-w-md mx-auto" />
                </div>
              ) : uploadResults ? (
                <div className="w-full space-y-4">
                  <div className="flex items-center justify-center">
                    {uploadResults.failed === 0 ? (
                      <CheckCircle className="h-12 w-12 text-green-500" />
                    ) : uploadResults.success === 0 ? (
                      <XCircle className="h-12 w-12 text-destructive" />
                    ) : (
                      <AlertCircle className="h-12 w-12 text-amber-500" />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-medium">
                      {uploadResults.failed === 0
                        ? 'Import completed successfully!'
                        : uploadResults.success === 0
                          ? 'Import failed'
                          : 'Import completed with some issues'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {uploadResults.success} of {uploadResults.total} records imported successfully.
                    </p>
                  </div>
                  
                  {uploadResults.errors.length > 0 && (
                    <Alert variant="destructive" className="mt-4 text-left">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Import Errors</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-5 mt-2 text-sm max-h-32 overflow-y-auto">
                          {uploadResults.errors.slice(0, 5).map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                          {uploadResults.errors.length > 5 && (
                            <li className="font-medium">
                              ...and {uploadResults.errors.length - 5} more errors
                            </li>
                          )}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="flex flex-wrap gap-2 justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setUploadResults(null)}
                    >
                      Upload Another File
                    </Button>
                    
                    {uploadResults.success > 0 && (
                      <Button onClick={onImportComplete}>
                        Continue
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                  <div className="space-y-2">
                    <h3 className="font-medium">Upload a CSV file</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      {activeTab === 'customers' 
                        ? 'Import your customer list with names, contact information, and notes.'
                        : activeTab === 'services'
                          ? 'Import your service offerings with names, descriptions, and prices.'
                          : 'Import your existing appointments with dates, times, and customer information.'}
                    </p>
                  </div>
                  
                  <div className="mt-6 space-y-4">
                    <Button asChild variant="secondary" className="relative">
                      <label>
                        <input
                          type="file"
                          accept=".csv"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={handleFileUpload}
                        />
                        <FileUpload className="mr-2 h-4 w-4" />
                        Select CSV File
                      </label>
                    </Button>
                    
                    <div className="text-sm text-muted-foreground">
                      <a
                        href={getTemplateLink()}
                        download
                        className="text-primary hover:underline inline-flex items-center"
                      >
                        <FileSpreadsheet className="mr-1 h-3 w-3" />
                        Download template
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between border-t px-6 py-4">
        <p className="text-xs text-muted-foreground">
          Need help with importing? <a href="#" className="text-primary hover:underline">View our guide</a>
        </p>
        {!isUploading && !uploadResults && (
          <Button variant="ghost" onClick={onImportComplete}>
            Skip for now
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}