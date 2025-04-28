import { Request, Response } from "express";
import { isAuthenticated } from "../auth";
import { db } from "../db";
import { customers, services, appointments } from "@shared/schema";
import { eq } from "drizzle-orm";

// Customer import handler
export async function importCustomers(req: Request, res: Response) {
  try {
    const { businessId, data } = req.body;
    
    if (!businessId) {
      return res.status(400).json({ 
        message: "Business ID is required",
        success: 0,
        failed: data.length,
        errors: ["Business ID is required"] 
      });
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ 
        message: "No valid data provided",
        success: 0,
        failed: 0,
        errors: ["No valid data provided"] 
      });
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Process each customer record
    for (const customerData of data) {
      try {
        // Validate required fields
        if (!customerData.firstName || !customerData.lastName) {
          results.failed++;
          results.errors.push(`Customer ${results.success + results.failed}: First name and last name are required`);
          continue;
        }
        
        // Check for existing customer with same email to avoid duplicates
        if (customerData.email) {
          const existingCustomers = await db.select().from(customers).where(
            eq(customers.email, customerData.email)
          );
          
          if (existingCustomers.length > 0) {
            results.failed++;
            results.errors.push(`Customer ${results.success + results.failed}: Email ${customerData.email} already exists`);
            continue;
          }
        }
        
        // Insert customer
        await db.insert(customers).values({
          businessId,
          firstName: customerData.firstName,
          lastName: customerData.lastName,
          email: customerData.email || null,
          phone: customerData.phone || null,
          address: customerData.address || null,
          city: customerData.city || null,
          state: customerData.state || null,
          zip: customerData.zip || null,
          notes: customerData.notes || null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Customer ${results.success + results.failed}: ${error.message || "Unknown error"}`);
      }
    }
    
    return res.status(201).json(results);
  } catch (error: any) {
    return res.status(500).json({ 
      message: error.message || "An error occurred while importing customers",
      success: 0,
      failed: req.body.data?.length || 0,
      errors: [error.message || "An error occurred while importing customers"]
    });
  }
}

// Service import handler
export async function importServices(req: Request, res: Response) {
  try {
    const { businessId, data } = req.body;
    
    if (!businessId) {
      return res.status(400).json({ 
        message: "Business ID is required",
        success: 0,
        failed: data.length,
        errors: ["Business ID is required"] 
      });
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ 
        message: "No valid data provided",
        success: 0,
        failed: 0,
        errors: ["No valid data provided"] 
      });
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Process each service record
    for (const serviceData of data) {
      try {
        // Validate required fields
        if (!serviceData.name || !serviceData.price) {
          results.failed++;
          results.errors.push(`Service ${results.success + results.failed}: Name and price are required`);
          continue;
        }
        
        // Check for existing service with same name to avoid duplicates
        const existingServices = await db.select().from(services).where(
          eq(services.name, serviceData.name)
        );
        
        if (existingServices.length > 0) {
          results.failed++;
          results.errors.push(`Service ${results.success + results.failed}: Service name ${serviceData.name} already exists`);
          continue;
        }
        
        // Convert price from string to number if needed
        const price = typeof serviceData.price === 'string' 
          ? parseFloat(serviceData.price) 
          : serviceData.price;
          
        // Convert duration from string to number if needed
        const duration = serviceData.duration
          ? typeof serviceData.duration === 'string'
            ? parseInt(serviceData.duration, 10)
            : serviceData.duration
          : 60; // Default duration
        
        // Insert service
        await db.insert(services).values({
          businessId,
          name: serviceData.name,
          description: serviceData.description || null,
          price,
          duration,
          category: serviceData.category || null,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Service ${results.success + results.failed}: ${error.message || "Unknown error"}`);
      }
    }
    
    return res.status(201).json(results);
  } catch (error: any) {
    return res.status(500).json({ 
      message: error.message || "An error occurred while importing services",
      success: 0,
      failed: req.body.data?.length || 0,
      errors: [error.message || "An error occurred while importing services"]
    });
  }
}

// Appointment import handler
export async function importAppointments(req: Request, res: Response) {
  try {
    const { businessId, data } = req.body;
    
    if (!businessId) {
      return res.status(400).json({ 
        message: "Business ID is required",
        success: 0,
        failed: data.length,
        errors: ["Business ID is required"] 
      });
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ 
        message: "No valid data provided",
        success: 0,
        failed: 0,
        errors: ["No valid data provided"] 
      });
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Process each appointment record
    for (const appointmentData of data) {
      try {
        // Validate required fields
        if (!appointmentData.date || !appointmentData.startTime) {
          results.failed++;
          results.errors.push(`Appointment ${results.success + results.failed}: Date and start time are required`);
          continue;
        }
        
        // Process customer information
        let customerId = appointmentData.customerId;
        
        // If customer ID is not provided but we have customer details, try to find or create the customer
        if (!customerId && appointmentData.customerEmail) {
          // Look for existing customer with this email
          const existingCustomers = await db.select().from(customers).where(
            eq(customers.email, appointmentData.customerEmail)
          );
          
          if (existingCustomers.length > 0) {
            customerId = existingCustomers[0].id;
          } else if (appointmentData.customerName) {
            // Create a new customer
            const nameParts = appointmentData.customerName.split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
            
            const [newCustomer] = await db.insert(customers).values({
              businessId,
              firstName,
              lastName,
              email: appointmentData.customerEmail,
              phone: appointmentData.customerPhone || null,
              createdAt: new Date(),
              updatedAt: new Date()
            }).returning();
            
            customerId = newCustomer.id;
          }
        }
        
        if (!customerId) {
          results.failed++;
          results.errors.push(`Appointment ${results.success + results.failed}: Valid customer information is required`);
          continue;
        }
        
        // Process service information
        let serviceId = appointmentData.serviceId;
        
        // If service ID is not provided but we have service name, try to find the service
        if (!serviceId && appointmentData.serviceName) {
          const existingServices = await db.select().from(services).where(
            eq(services.name, appointmentData.serviceName)
          );
          
          if (existingServices.length > 0) {
            serviceId = existingServices[0].id;
          }
        }
        
        // Parse date and times
        const appointmentDate = new Date(appointmentData.date);
        const [startHour, startMinute] = appointmentData.startTime.split(':').map(Number);
        const endTime = appointmentData.endTime || ''; // Default empty string
        const [endHour, endMinute] = endTime ? endTime.split(':').map(Number) : [startHour + 1, startMinute]; // Default 1 hour later
        
        const startDateTime = new Date(appointmentDate);
        startDateTime.setHours(startHour, startMinute);
        
        const endDateTime = new Date(appointmentDate);
        endDateTime.setHours(endHour, endMinute);
        
        // Insert appointment
        await db.insert(appointments).values({
          businessId,
          customerId,
          serviceId: serviceId || null,
          title: appointmentData.serviceName || 'Appointment',
          start: startDateTime,
          end: endDateTime,
          notes: appointmentData.notes || null,
          status: appointmentData.status || 'scheduled',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Appointment ${results.success + results.failed}: ${error.message || "Unknown error"}`);
      }
    }
    
    return res.status(201).json(results);
  } catch (error: any) {
    return res.status(500).json({ 
      message: error.message || "An error occurred while importing appointments",
      success: 0,
      failed: req.body.data?.length || 0,
      errors: [error.message || "An error occurred while importing appointments"]
    });
  }
}