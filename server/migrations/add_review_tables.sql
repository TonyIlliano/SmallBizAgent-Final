-- Review Settings table (business review link configuration)
CREATE TABLE IF NOT EXISTS review_settings (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  google_review_url TEXT,
  yelp_review_url TEXT,
  facebook_review_url TEXT,
  custom_review_url TEXT,
  review_request_enabled BOOLEAN DEFAULT TRUE,
  auto_send_after_job_completion BOOLEAN DEFAULT TRUE,
  delay_hours_after_completion INTEGER DEFAULT 2,
  sms_template TEXT DEFAULT 'Hi {customerName}! Thank you for choosing {businessName}. We''d love to hear about your experience. Please leave us a review: {reviewLink}',
  email_subject TEXT DEFAULT 'How was your experience with {businessName}?',
  email_template TEXT,
  preferred_platform TEXT DEFAULT 'google',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Review Requests table (tracking sent review requests)
CREATE TABLE IF NOT EXISTS review_requests (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  job_id INTEGER,
  sent_via TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  platform TEXT,
  review_link TEXT,
  status TEXT DEFAULT 'sent',
  clicked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_review_settings_business_id ON review_settings(business_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_business_id ON review_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_customer_id ON review_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_job_id ON review_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status);
