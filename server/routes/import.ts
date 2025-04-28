import { Request, Response } from "express";
import { z } from "zod";
import { insertCustomerSchema, insertServiceSchema, insertAppointmentSchema } from "@shared/schema";
import { storage } from "../storage";

// Base validators for import data
const customerImportSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

const serviceImportSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  price: z.number().optional().transform(val => val ?? 0),
  duration: z.number().optional().transform(val => val ?? 60),
  active: z.boolean().optional().transform(val => val ?? true),
}).passthrough();

const appointmentImportSchema = z.object({
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(), 
  serviceName: z.string().optional(),
  startDate: z.string().transform(val => new Date(val)),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  duration: z.number().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

/**
 * Handles importing customers from CSV data
 */
export async function importCustomers(req: Request, res: Response) {
  try {
    const { businessId, data } = req.body;
    
    if (!businessId) {
      return res.status(400).json({ message: "Business ID is required" });
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: "No data provided for import" });
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Process each customer record
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      
      try {
        // Validate the record
        const validRecord = customerImportSchema.parse(record);
        
        // Skip records without required fields
        if (!validRecord.lastName) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing last name`);
          continue;
        }
        
        // Create a customer object
        const customer = {
          businessId,
          firstName: validRecord.firstName || "",
          lastName: validRecord.lastName,
          email: validRecord.email || "",
          phone: validRecord.phone || null,
          address: validRecord.address || null,
          city: validRecord.city || null,
          state: validRecord.state || null,
          zipCode: validRecord.zipCode || null,
          notes: validRecord.notes || null,
          active: true
        };
        
        // Validate with the insert schema
        const validatedData = insertCustomerSchema.parse(customer);
        
        // Check for duplicate emails if present
        if (validatedData.email) {
          const existingCustomers = await storage.getCustomers(businessId, { email: validatedData.email });
          if (existingCustomers && existingCustomers.length > 0) {
            results.failed++;
            results.errors.push(`Row ${i + 1}: Customer with email ${validatedData.email} already exists`);
            continue;
          }
        }
        
        // Create the customer
        await storage.createCustomer(validatedData);
        results.success++;
      } catch (error) {
        results.failed++;
        if (error instanceof z.ZodError) {
          results.errors.push(`Row ${i + 1}: ${error.errors[0].message}`);
        } else if (error instanceof Error) {
          results.errors.push(`Row ${i + 1}: ${error.message}`);
        } else {
          results.errors.push(`Row ${i + 1}: Unknown error`);
        }
      }
    }
    
    res.status(200).json(results);
  } catch (error) {
    console.error("Error importing customers:", error);
    res.status(500).json({ message: "Error importing customers" });
  }
}

/**
 * Handles importing services from CSV data
 */
export async function importServices(req: Request, res: Response) {
  try {
    const { businessId, data } = req.body;
    
    if (!businessId) {
      return res.status(400).json({ message: "Business ID is required" });
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: "No data provided for import" });
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Process each service record
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      
      try {
        // Validate the record
        const validRecord = serviceImportSchema.parse(record);
        
        // Skip records without required fields
        if (!validRecord.name) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing service name`);
          continue;
        }
        
        // Create a service object
        const service = {
          businessId,
          name: validRecord.name,
          description: validRecord.description || null,
          price: validRecord.price || 0,
          duration: validRecord.duration || 60,
          active: validRecord.active ?? true
        };
        
        // Validate with the insert schema
        const validatedData = insertServiceSchema.parse(service);
        
        // Check for duplicate service names
        const existingServices = await storage.getServices(businessId);
        const duplicateService = existingServices.find(s => 
          s.name.toLowerCase() === validatedData.name.toLowerCase()
        );
        
        if (duplicateService) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Service with name "${validatedData.name}" already exists`);
          continue;
        }
        
        // Create the service
        await storage.createService(validatedData);
        results.success++;
      } catch (error) {
        results.failed++;
        if (error instanceof z.ZodError) {
          results.errors.push(`Row ${i + 1}: ${error.errors[0].message}`);
        } else if (error instanceof Error) {
          results.errors.push(`Row ${i + 1}: ${error.message}`);
        } else {
          results.errors.push(`Row ${i + 1}: Unknown error`);
        }
      }
    }
    
    res.status(200).json(results);
  } catch (error) {
    console.error("Error importing services:", error);
    res.status(500).json({ message: "Error importing services" });
  }
}

/**
 * Handles importing appointments from CSV data
 */
export async function importAppointments(req: Request, res: Response) {
  try {
    const { businessId, data } = req.body;
    
    if (!businessId) {
      return res.status(400).json({ message: "Business ID is required" });
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: "No data provided for import" });
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Get all customers and services for lookup
    const customers = await storage.getCustomers(businessId);
    const services = await storage.getServices(businessId);
    
    // Process each appointment record
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      
      try {
        // Validate the record
        const validRecord = appointmentImportSchema.parse(record);
        
        // Skip records without start date
        if (!validRecord.startDate) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing or invalid start date`);
          continue;
        }
        
        // Find or create customer
        let customerId = null;
        if (validRecord.customerEmail) {
          // Look up by email first
          const existingCustomer = customers.find(c => 
            c.email && c.email.toLowerCase() === validRecord.customerEmail?.toLowerCase()
          );
          
          if (existingCustomer) {
            customerId = existingCustomer.id;
          } else if (validRecord.customerName) {
            // Create a new customer if we have name and email
            const nameParts = validRecord.customerName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || firstName;
            
            const newCustomer = await storage.createCustomer({
              businessId,
              firstName,
              lastName,
              email: validRecord.customerEmail,
              phone: validRecord.customerPhone || null,
              active: true
            });
            
            customerId = newCustomer.id;
            customers.push(newCustomer); // Add to our local cache
          } else {
            results.failed++;
            results.errors.push(`Row ${i + 1}: Customer email provided but no customer name`);
            continue;
          }
        } else if (validRecord.customerName) {
          // Try to match by name if no email
          const nameMatch = customers.find(c => {
            const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
            return fullName === validRecord.customerName?.toLowerCase();
          });
          
          if (nameMatch) {
            customerId = nameMatch.id;
          } else {
            results.failed++;
            results.errors.push(`Row ${i + 1}: Customer "${validRecord.customerName}" not found, please include email to create new customer`);
            continue;
          }
        } else {
          results.failed++;
          results.errors.push(`Row ${i + 1}: No customer information provided`);
          continue;
        }
        
        // Find service if serviceName provided
        let serviceId = null;
        if (validRecord.serviceName) {
          const service = services.find(s => 
            s.name.toLowerCase() === validRecord.serviceName?.toLowerCase()
          );
          
          if (service) {
            serviceId = service.id;
          } else {
            results.failed++;
            results.errors.push(`Row ${i + 1}: Service "${validRecord.serviceName}" not found`);
            continue;
          }
        }
        
        // Calculate end date if not provided
        let endDate = validRecord.endDate;
        if (!endDate && validRecord.duration) {
          const startMs = validRecord.startDate.getTime();
          endDate = new Date(startMs + (validRecord.duration * 60 * 1000));
        } else if (!endDate && serviceId) {
          // Try to get duration from service
          const service = services.find(s => s.id === serviceId);
          if (service && service.duration) {
            const startMs = validRecord.startDate.getTime();
            endDate = new Date(startMs + (service.duration * 60 * 1000));
          } else {
            // Default to 1 hour
            const startMs = validRecord.startDate.getTime();
            endDate = new Date(startMs + (60 * 60 * 1000));
          }
        } else if (!endDate) {
          // Default to 1 hour if no duration specified
          const startMs = validRecord.startDate.getTime();
          endDate = new Date(startMs + (60 * 60 * 1000));
        }
        
        // Create appointment object
        const appointment = {
          businessId,
          customerId,
          serviceId,
          startDate: validRecord.startDate,
          endDate,
          notes: validRecord.notes || null,
          status: validRecord.status || 'scheduled',
          allDay: false,
          recurringAppointmentId: null
        };
        
        // Validate with the insert schema
        const validatedData = insertAppointmentSchema.parse(appointment);
        
        // Create the appointment
        await storage.createAppointment(validatedData);
        results.success++;
      } catch (error) {
        results.failed++;
        if (error instanceof z.ZodError) {
          results.errors.push(`Row ${i + 1}: ${error.errors[0].message}`);
        } else if (error instanceof Error) {
          results.errors.push(`Row ${i + 1}: ${error.message}`);
        } else {
          results.errors.push(`Row ${i + 1}: Unknown error`);
        }
      }
    }
    
    res.status(200).json(results);
  } catch (error) {
    console.error("Error importing appointments:", error);
    res.status(500).json({ message: "Error importing appointments" });
  }
}