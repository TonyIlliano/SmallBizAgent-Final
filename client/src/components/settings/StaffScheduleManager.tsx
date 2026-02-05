import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Edit2, Trash2, Clock, Loader2, Calendar } from "lucide-react";

interface Staff {
  id: number;
  businessId: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: string;
  specialty?: string;
  bio?: string;
  active: boolean;
}

interface StaffHours {
  id?: number;
  staffId: number;
  day: string;
  startTime?: string;
  endTime?: string;
  isOff: boolean;
}

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface StaffScheduleManagerProps {
  businessId: number;
}

export function StaffScheduleManager({ businessId }: StaffScheduleManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [hoursDialogOpen, setHoursDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [selectedStaffForHours, setSelectedStaffForHours] = useState<Staff | null>(null);

  // Staff form state
  const [staffForm, setStaffForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: '',
    specialty: '',
    bio: '',
    active: true,
  });

  // Hours form state
  const [hoursForm, setHoursForm] = useState<Record<string, { startTime: string; endTime: string; isOff: boolean }>>({});

  // Fetch staff
  const { data: staff = [], isLoading: isLoadingStaff } = useQuery({
    queryKey: ['/api/staff', { businessId }],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/staff?businessId=${businessId}`);
      return res.json();
    },
    enabled: !!businessId,
  });

  // Fetch staff hours when editing
  const { data: staffHours = [], refetch: refetchHours } = useQuery({
    queryKey: ['/api/staff/hours', selectedStaffForHours?.id],
    queryFn: async () => {
      if (!selectedStaffForHours) return [];
      const res = await apiRequest('GET', `/api/staff/${selectedStaffForHours.id}/hours`);
      return res.json();
    },
    enabled: !!selectedStaffForHours,
  });

  // Initialize hours form when staff hours are loaded
  useEffect(() => {
    if (staffHours && selectedStaffForHours) {
      const newHoursForm: Record<string, { startTime: string; endTime: string; isOff: boolean }> = {};

      DAYS_OF_WEEK.forEach(day => {
        const dayHours = staffHours.find((h: StaffHours) => h.day === day);
        newHoursForm[day] = {
          startTime: dayHours?.startTime || '09:00',
          endTime: dayHours?.endTime || '17:00',
          isOff: dayHours?.isOff || false,
        };
      });

      setHoursForm(newHoursForm);
    }
  }, [staffHours, selectedStaffForHours]);

  // Create staff mutation
  const createStaffMutation = useMutation({
    mutationFn: async (data: typeof staffForm) => {
      const res = await apiRequest('POST', '/api/staff', { ...data, businessId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff'] });
      setStaffDialogOpen(false);
      resetStaffForm();
      toast({ title: 'Success', description: 'Team member added successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add team member', variant: 'destructive' });
    },
  });

  // Update staff mutation
  const updateStaffMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof staffForm }) => {
      const res = await apiRequest('PUT', `/api/staff/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff'] });
      setStaffDialogOpen(false);
      setEditingStaff(null);
      resetStaffForm();
      toast({ title: 'Success', description: 'Team member updated successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update team member', variant: 'destructive' });
    },
  });

  // Delete staff mutation
  const deleteStaffMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff'] });
      toast({ title: 'Success', description: 'Team member removed' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to remove team member', variant: 'destructive' });
    },
  });

  // Save hours mutation
  const saveHoursMutation = useMutation({
    mutationFn: async ({ staffId, hours }: { staffId: number; hours: StaffHours[] }) => {
      const res = await apiRequest('PUT', `/api/staff/${staffId}/hours`, { hours });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff/hours'] });
      setHoursDialogOpen(false);
      setSelectedStaffForHours(null);
      toast({ title: 'Success', description: 'Schedule saved successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save schedule', variant: 'destructive' });
    },
  });

  const resetStaffForm = () => {
    setStaffForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: '',
      specialty: '',
      bio: '',
      active: true,
    });
  };

  const openEditStaffDialog = (member: Staff) => {
    setEditingStaff(member);
    setStaffForm({
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email || '',
      phone: member.phone || '',
      role: member.role || '',
      specialty: member.specialty || '',
      bio: member.bio || '',
      active: member.active,
    });
    setStaffDialogOpen(true);
  };

  const openHoursDialog = (member: Staff) => {
    setSelectedStaffForHours(member);
    setHoursDialogOpen(true);
  };

  const handleSaveStaff = () => {
    if (editingStaff) {
      updateStaffMutation.mutate({ id: editingStaff.id, data: staffForm });
    } else {
      createStaffMutation.mutate(staffForm);
    }
  };

  const handleSaveHours = () => {
    if (!selectedStaffForHours) return;

    const hours: StaffHours[] = DAYS_OF_WEEK.map(day => ({
      staffId: selectedStaffForHours.id,
      day,
      startTime: hoursForm[day]?.isOff ? undefined : hoursForm[day]?.startTime,
      endTime: hoursForm[day]?.isOff ? undefined : hoursForm[day]?.endTime,
      isOff: hoursForm[day]?.isOff || false,
    }));

    saveHoursMutation.mutate({ staffId: selectedStaffForHours.id, hours });
  };

  const handleDeleteStaff = (id: number) => {
    if (confirm('Are you sure you want to remove this team member?')) {
      deleteStaffMutation.mutate(id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage your staff and their individual schedules. The AI receptionist will use this to book appointments with specific team members.
            </CardDescription>
          </div>
          <Button onClick={() => { resetStaffForm(); setEditingStaff(null); setStaffDialogOpen(true); }}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Team Member
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingStaff ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No team members added yet.</p>
            <p className="text-sm">Add your staff members so customers can book with specific people.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Specialty/Role</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member: Staff) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.firstName} {member.lastName}
                  </TableCell>
                  <TableCell>
                    {member.specialty || member.role || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {member.phone && <div>{member.phone}</div>}
                      {member.email && <div className="text-muted-foreground">{member.email}</div>}
                      {!member.phone && !member.email && <span className="text-muted-foreground">-</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.active ? "default" : "secondary"}>
                      {member.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openHoursDialog(member)}>
                      <Clock className="h-4 w-4 mr-1" />
                      Schedule
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditStaffDialog(member)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteStaff(member.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Add/Edit Staff Dialog */}
        <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStaff ? 'Edit Team Member' : 'Add Team Member'}</DialogTitle>
              <DialogDescription>
                Add details about this team member. Customers can request them by name when booking.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input
                    value={staffForm.firstName}
                    onChange={(e) => setStaffForm({ ...staffForm, firstName: e.target.value })}
                    placeholder="e.g., Mike"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input
                    value={staffForm.lastName}
                    onChange={(e) => setStaffForm({ ...staffForm, lastName: e.target.value })}
                    placeholder="e.g., Smith"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Specialty/Title</Label>
                <Input
                  value={staffForm.specialty}
                  onChange={(e) => setStaffForm({ ...staffForm, specialty: e.target.value })}
                  placeholder="e.g., Senior Barber, Colorist, Master Stylist"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    placeholder="(555) 555-5555"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                    placeholder="mike@example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bio (shown to customers)</Label>
                <Textarea
                  value={staffForm.bio}
                  onChange={(e) => setStaffForm({ ...staffForm, bio: e.target.value })}
                  placeholder="Short bio about this team member..."
                  rows={2}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={staffForm.active}
                  onCheckedChange={(checked) => setStaffForm({ ...staffForm, active: checked })}
                />
                <Label>Active (available for booking)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStaffDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSaveStaff}
                disabled={!staffForm.firstName || !staffForm.lastName || createStaffMutation.isPending || updateStaffMutation.isPending}
              >
                {(createStaffMutation.isPending || updateStaffMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingStaff ? 'Save Changes' : 'Add Member'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Hours Dialog */}
        <Dialog open={hoursDialogOpen} onOpenChange={setHoursDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {selectedStaffForHours ? `${selectedStaffForHours.firstName}'s Schedule` : 'Schedule'}
              </DialogTitle>
              <DialogDescription>
                Set the working hours for this team member. The AI will only book appointments during these times.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <div className="w-24 capitalize font-medium">{day}</div>
                  <Switch
                    checked={!hoursForm[day]?.isOff}
                    onCheckedChange={(checked) => {
                      setHoursForm({
                        ...hoursForm,
                        [day]: { ...hoursForm[day], isOff: !checked }
                      });
                    }}
                  />
                  {hoursForm[day]?.isOff ? (
                    <span className="text-muted-foreground text-sm">Day off</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        value={hoursForm[day]?.startTime || '09:00'}
                        onChange={(e) => {
                          setHoursForm({
                            ...hoursForm,
                            [day]: { ...hoursForm[day], startTime: e.target.value }
                          });
                        }}
                        className="w-28"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={hoursForm[day]?.endTime || '17:00'}
                        onChange={(e) => {
                          setHoursForm({
                            ...hoursForm,
                            [day]: { ...hoursForm[day], endTime: e.target.value }
                          });
                        }}
                        className="w-28"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHoursDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveHours} disabled={saveHoursMutation.isPending}>
                {saveHoursMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
