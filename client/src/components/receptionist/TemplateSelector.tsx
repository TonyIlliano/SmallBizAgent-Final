import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Loader2, Check, Filter, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// Template interfaces
interface IntentTemplate {
  id: string;
  name: string;
  description: string;
  sampleUtterances: string[];
  industry: string;
  isCommon: boolean;
}

export default function TemplateSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<string>("general");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available industries
  const { 
    data: industries = [], 
    isLoading: isLoadingIndustries,
    error: industriesError
  } = useQuery<string[]>({
    queryKey: ["/api/training/templates/industries"],
    enabled: isOpen, // Only fetch when dialog is open
  });

  // Fetch templates based on selected industry
  const {
    data: templates = [],
    isLoading: isLoadingTemplates,
    error: templatesError
  } = useQuery<IntentTemplate[]>({
    queryKey: ["/api/training/templates", selectedIndustry],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/training/templates/${selectedIndustry}`);
      return res.json();
    },
    enabled: isOpen && !!selectedIndustry, // Only fetch when dialog is open and industry is selected
  });

  // Apply template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: async ({ templateId, industry }: { templateId: string, industry: string }) => {
      const res = await apiRequest("POST", "/api/training/templates/apply", {
        templateId,
        industry
      });
      return res.json();
    },
    onSuccess: () => {
      // Invalidate intents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/training/intents"] });
      setIsOpen(false);
      toast({
        title: "Template applied",
        description: "The template was successfully applied as a new intent",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to apply template",
        description: error?.message || "An unknown error occurred",
        variant: "destructive",
      });
    }
  });

  // Apply template handler
  const handleApplyTemplate = (template: IntentTemplate) => {
    applyTemplateMutation.mutate({
      templateId: template.id,
      industry: template.industry
    });
  };

  // Filter templates based on search term and active tab
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = searchTerm === "" || 
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = 
      activeTab === "all" || 
      (activeTab === "common" && template.isCommon) ||
      (activeTab === "industry" && !template.isCommon);
    
    return matchesSearch && matchesTab;
  });

  // Group templates by type for better organization
  const commonTemplates = filteredTemplates.filter(t => t.isCommon);
  const industryTemplates = filteredTemplates.filter(t => !t.isCommon);

  // Format industry name for display
  const formatIndustryName = (industry: any): string => {
    if (!industry) return "Unknown";
    
    const industryStr = typeof industry === 'string' ? industry : String(industry);
    
    if (industryStr === "general") return "General Business";
    return industryStr.charAt(0).toUpperCase() + industryStr.slice(1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Use Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Intent Templates</DialogTitle>
          <DialogDescription>
            Select a pre-built intent template to quickly set up your virtual receptionist
          </DialogDescription>
        </DialogHeader>

        {isLoadingIndustries ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : industriesError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load industry types. Please try again.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="md:w-1/3">
                <Label htmlFor="industry-select">Business Type</Label>
                <Select
                  value={selectedIndustry}
                  onValueChange={setSelectedIndustry}
                >
                  <SelectTrigger id="industry-select" className="w-full">
                    <SelectValue placeholder="Select business type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Business Types</SelectLabel>
                      {industries.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {formatIndustryName(industry)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:w-2/3">
                <Label htmlFor="search-templates">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search-templates"
                    placeholder="Search templates..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="all">All Templates</TabsTrigger>
                  <TabsTrigger value="common">Common</TabsTrigger>
                  <TabsTrigger value="industry">Industry-Specific</TabsTrigger>
                </TabsList>
                <div className="text-sm text-muted-foreground">
                  {filteredTemplates.length} templates available
                </div>
              </div>

              <TabsContent value="all" className="mt-4">
                {isLoadingTemplates ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : templatesError ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Failed to load templates. Please try again.
                    </AlertDescription>
                  </Alert>
                ) : filteredTemplates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates found for your search criteria
                  </div>
                ) : (
                  <div className="space-y-6">
                    {commonTemplates.length > 0 && (
                      <div>
                        <h3 className="text-lg font-medium mb-3">Common Intents</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {commonTemplates.map((template) => (
                            <TemplateCard
                              key={template.id}
                              template={template}
                              onApply={handleApplyTemplate}
                              isLoading={applyTemplateMutation.isPending}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {industryTemplates.length > 0 && (
                      <div>
                        <h3 className="text-lg font-medium mb-3">
                          {formatIndustryName(selectedIndustry)} Specific Intents
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {industryTemplates.map((template) => (
                            <TemplateCard
                              key={template.id}
                              template={template}
                              onApply={handleApplyTemplate}
                              isLoading={applyTemplateMutation.isPending}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="common" className="mt-4">
                {isLoadingTemplates ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : templatesError ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Failed to load templates. Please try again.
                    </AlertDescription>
                  </Alert>
                ) : commonTemplates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No common templates found for your search criteria
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {commonTemplates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onApply={handleApplyTemplate}
                        isLoading={applyTemplateMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="industry" className="mt-4">
                {isLoadingTemplates ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : templatesError ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Failed to load templates. Please try again.
                    </AlertDescription>
                  </Alert>
                ) : industryTemplates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No industry-specific templates found for your search criteria
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {industryTemplates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onApply={handleApplyTemplate}
                        isLoading={applyTemplateMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Individual template card component
interface TemplateCardProps {
  template: IntentTemplate;
  onApply: (template: IntentTemplate) => void;
  isLoading: boolean;
}

function TemplateCard({ template, onApply, isLoading }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="transition-all">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{template.name}</CardTitle>
          {template.isCommon ? (
            <Badge variant="outline" className="bg-slate-100">Common</Badge>
          ) : (
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
              {formatIndustryName(template.industry)}
            </Badge>
          )}
        </div>
        <CardDescription>{template.description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="text-xs text-muted-foreground mb-1">
          Sample utterances ({template.sampleUtterances.length}):
        </div>
        <div className="space-y-1 text-sm">
          {expanded ? (
            template.sampleUtterances.map((utterance, idx) => (
              <div key={idx} className="border-l-2 border-slate-200 pl-2">
                "{utterance}"
              </div>
            ))
          ) : (
            <>
              <div className="border-l-2 border-slate-200 pl-2">
                "{template.sampleUtterances[0]}"
              </div>
              {template.sampleUtterances.length > 1 && (
                <Button
                  variant="link"
                  className="text-xs h-auto p-0"
                  onClick={() => setExpanded(true)}
                >
                  Show {template.sampleUtterances.length - 1} more examples
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          onClick={() => onApply(template)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Use This Template
        </Button>
      </CardFooter>
    </Card>
  );
}