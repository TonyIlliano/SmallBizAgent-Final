-- Create notification_settings table for per-business notification preferences
CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  appointment_confirmation_email BOOLEAN DEFAULT true,
  appointment_confirmation_sms BOOLEAN DEFAULT true,
  appointment_reminder_email BOOLEAN DEFAULT true,
  appointment_reminder_sms BOOLEAN DEFAULT true,
  appointment_reminder_hours INTEGER DEFAULT 24,
  invoice_created_email BOOLEAN DEFAULT true,
  invoice_created_sms BOOLEAN DEFAULT false,
  invoice_reminder_email BOOLEAN DEFAULT true,
  invoice_reminder_sms BOOLEAN DEFAULT true,
  invoice_payment_confirmation_email BOOLEAN DEFAULT true,
  job_completed_email BOOLEAN DEFAULT true,
  job_completed_sms BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create notification_log table for audit trail of all sent notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  customer_id INTEGER,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  message TEXT,
  status TEXT DEFAULT 'sent',
  reference_type TEXT,
  reference_id INTEGER,
  error TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
