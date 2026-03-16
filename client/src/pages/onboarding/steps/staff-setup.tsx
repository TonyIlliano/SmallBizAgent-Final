import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Users, Trash2, CheckCircle2 } from 'lucide-react';

interface StaffSetupProps {
  onComplete: () => void;
  onSkip?: () => void;
}

const staffFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  specialty: z.string().optional().or(z.literal('')),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

interface StaffMember {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  specialty?: string;
}

export default function StaffSetup({ onComplete, onSkip }: StaffSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Fetch existing staff
  const { data: staffMembers = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: [`/api/staff?businessId=${user?.businessId}`],
    enabled: !!user?.businessId,
  });

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      specialty: '',
    },
  });

  // Add staff mutation
  const addStaffMutation = useMutation({
    mutationFn: async (data: StaffFormValues) => {
      const res = await apiRequest('POST', '/api/staff', {
        ...data,
        businessId: user?.businessId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/staff?businessId=${user?.businessId}`] });
      toast({ title: 'Staff member added!' });
      form.reset();
      setAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error adding staff',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  // Delete staff mutation
  const deleteStaffMutation = useMutation({
    mutationFn: async (staffId: number) => {
      await apiRequest('DELETE', `/api/staff/${staffId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/staff?businessId=${user?.businessId}`] });
      toast({ title: 'Staff member removed' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Add Your Team</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Add staff members so your AI receptionist can book appointments with specific team members
          and manage their schedules.
        </p>
      </div>

      {/* Current staff list */}
      {staffMembers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Team Members ({staffMembers.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {staffMembers.map((staff) => (
              <div
                key={staff.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div>
                  <p className="font-medium">{staff.firstName} {staff.lastName}</p>
                  <div className="flex gap-3 text-sm text-muted-foreground">
                    {staff.specialty && <span>{staff.specialty}</span>}
                    {staff.email && <span>{staff.email}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteStaffMutation.mutate(staff.id)}
                  disabled={deleteStaffMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add staff dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogTrigger asChild>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors border-dashed">
            <CardContent className="flex items-center justify-center gap-2 py-8">
              <Plus className="h-5 w-5 text-primary" />
              <span className="font-medium">Add a Team Member</span>
            </CardContent>
          </Card>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => addStaffMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Smith" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="john@example.com" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="specialty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role / Specialty</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Senior Stylist, Technician" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addStaffMutation.isPending}>
                  {addStaffMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</>
                  ) : (
                    'Add Member'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Tip */}
      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              You can add more team members, set individual schedules, and assign services
              to each member later in Settings. Staff members can also be invited to create
              their own accounts.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between pt-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button className="ml-auto" onClick={onComplete}>
          {staffMembers.length > 0 ? 'Continue' : 'Skip & Continue'}
        </Button>
      </div>
    </div>
  );
}
