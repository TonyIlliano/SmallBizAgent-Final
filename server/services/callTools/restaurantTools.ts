/**
 * callTools/restaurantTools — restaurant vertical voice tools: POS ordering
 * (Clover / Square / Heartland) + table reservations.
 *
 * Extracted from callToolHandlers.ts (audit R1 split). All handlers are
 * dispatched by name from the callToolHandlers registry; nothing here is
 * called outside the voice tool path.
 */

import { storage } from '../../storage';
import twilioService from '../twilioService';
import { getCachedMenu as getCloverCachedMenu, createOrder as createCloverOrder, type CachedMenu } from '../cloverService';
import { getCachedMenu as getSquareCachedMenu, createOrder as createSquareOrder } from '../squareService';
import { getCachedMenu as getHeartlandCachedMenu, createOrder as createHeartlandOrder } from '../heartlandService';
import { fireEvent } from '../webhookService';
import { getTimezoneAbbreviation } from '../../utils/timezone';
import { logAndSwallow } from '../../utils/safeAsync';
import { dataCache, getCachedBusiness, getCachedBusinessHours } from './cache';
import { createDateInTimezone, parseNaturalDate } from './datetime';

// ========== Restaurant Ordering Handler Functions (POS Integration) ==========

/**
 * Detect which POS system a business uses and return the cached menu.
 * Checks Square first (newer), then Clover.
 */
export async function getPOSCachedMenu(businessId: number): Promise<CachedMenu | null> {
  const business = await storage.getBusiness(businessId);
  if (!business) return null;

  if (business.squareAccessToken) {
    return getSquareCachedMenu(businessId);
  }
  if (business.cloverAccessToken) {
    return getCloverCachedMenu(businessId);
  }
  if (business.heartlandApiKey) {
    return getHeartlandCachedMenu(businessId);
  }
  return null;
}

/**
 * Detect which POS system a business uses: 'square', 'clover', or null
 */
export async function detectPOSType(businessId: number): Promise<'square' | 'clover' | 'heartland' | null> {
  const business = await storage.getBusiness(businessId);
  if (!business) return null;
  if (business.squareAccessToken) return 'square';
  if (business.cloverAccessToken) return 'clover';
  if (business.heartlandApiKey) return 'heartland';
  return null;
}

/**
 * Handle getMenu function call — returns the full cached menu formatted for voice
 */
export async function handleGetMenu(businessId: number): Promise<any> {
  try {
    const menu = await getPOSCachedMenu(businessId);
    if (!menu) {
      return {
        result: {
          error: 'Menu not available',
          message: "I'm sorry, I don't have the menu loaded right now. Let me transfer you to someone who can help with your order.",
          shouldTransfer: true
        }
      };
    }

    // Format menu for voice — organize by category
    const menuSummary = menu.categories.map(cat => {
      const items = cat.items.map(item => {
        let itemStr = `${item.name} - ${item.priceFormatted}`;
        if (item.modifierGroups.length > 0) {
          const modInfo = item.modifierGroups.map(g => {
            const options = g.modifiers.map(m => m.name).join(', ');
            return `${g.name}: ${options}`;
          }).join('; ');
          itemStr += ` (Options: ${modInfo})`;
        }
        return itemStr;
      }).join('\n    ');

      return `  ${cat.name}:\n    ${items}`;
    }).join('\n\n');

    return {
      result: {
        menu: menuSummary,
        categories: menu.categories.map(c => c.name),
        totalItems: menu.categories.reduce((sum, c) => sum + c.items.length, 0),
        // Include structured item data with IDs so createOrder can reference real POS item IDs
        itemDetails: menu.categories.flatMap(cat =>
          cat.items.map(item => ({
            id: item.id,
            name: item.name,
            category: cat.name,
            price: item.price,
            priceFormatted: item.priceFormatted,
            modifierGroups: item.modifierGroups
          }))
        ),
        message: `Here's our menu. We have ${menu.categories.length} categories: ${menu.categories.map(c => c.name).join(', ')}. What would you like to hear about?`
      }
    };
  } catch (error) {
    console.error(`Error getting menu for business ${businessId}:`, error);
    return {
      result: {
        error: 'Failed to load menu',
        message: "I'm having trouble loading the menu right now. Would you like me to transfer you to someone who can help?"
      }
    };
  }
}

/**
 * Handle getMenuCategory function call — returns items in a specific category
 */
export async function handleGetMenuCategory(businessId: number, categoryName: string): Promise<any> {
  try {
    const menu = await getPOSCachedMenu(businessId);
    if (!menu) {
      return {
        result: {
          error: 'Menu not available',
          message: "I'm sorry, I don't have the menu loaded right now."
        }
      };
    }

    // Find the category (fuzzy match)
    const searchName = (categoryName || '').toLowerCase();
    const category = menu.categories.find(c =>
      c.name.toLowerCase().includes(searchName) ||
      searchName.includes(c.name.toLowerCase())
    );

    if (!category) {
      const availableCategories = menu.categories.map(c => c.name).join(', ');
      return {
        result: {
          error: 'Category not found',
          availableCategories,
          message: `I don't see a "${categoryName}" category. Our menu categories are: ${availableCategories}. Which would you like to hear about?`
        }
      };
    }

    const items = category.items.map(item => {
      let itemStr = `${item.name} - ${item.priceFormatted}`;
      if (item.modifierGroups.length > 0) {
        const modInfo = item.modifierGroups.map(g => {
          const required = g.minRequired && g.minRequired > 0 ? ' (required)' : '';
          const options = g.modifiers.map(m =>
            m.price > 0 ? `${m.name} ${m.priceFormatted}` : m.name
          ).join(', ');
          return `${g.name}${required}: ${options}`;
        }).join('; ');
        itemStr += ` | Options: ${modInfo}`;
      }
      return itemStr;
    });

    return {
      result: {
        categoryName: category.name,
        items: items,
        itemCount: items.length,
        // Also include structured data for order creation
        itemDetails: category.items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          priceFormatted: item.priceFormatted,
          modifierGroups: item.modifierGroups
        })),
        message: `In our ${category.name} section, we have ${items.length} items: ${items.join('. ')}. What would you like?`
      }
    };
  } catch (error) {
    console.error(`Error getting menu category for business ${businessId}:`, error);
    return {
      result: {
        error: 'Failed to load menu category',
        message: "I'm having trouble loading that part of the menu. Would you like to try a different category?"
      }
    };
  }
}

/**
 * Handle createOrder function call — creates an order in the connected POS (Clover or Square)
 */
export async function handleCreateOrder(
  businessId: number,
  parameters: {
    items: Array<{
      itemId?: string;
      cloverItemId?: string; // Legacy field — kept for backward compatibility
      quantity: number;
      modifiers?: Array<{ modifierId?: string; cloverId?: string }>;
      notes?: string;
    }>;
    callerPhone?: string;
    callerName?: string;
    orderType?: string;
    orderNotes?: string;
  },
  callerPhone?: string
): Promise<any> {
  try {
    // Validate we have items
    if (!parameters.items || parameters.items.length === 0) {
      return {
        result: {
          error: 'No items in order',
          message: "It seems like the order is empty. What would you like to order?"
        }
      };
    }

    // Always prefer the real caller ID from VAPI over whatever the AI puts in the function args
    // The AI sometimes passes the business phone number or a wrong number in callerPhone
    const phone = callerPhone || parameters.callerPhone;
    const posType = await detectPOSType(businessId);

    // Validate order type against business settings — default to first enabled type
    const business = await storage.getBusiness(businessId);
    const pickupEnabled = business?.restaurantPickupEnabled ?? true;
    const deliveryEnabled = business?.restaurantDeliveryEnabled ?? false;
    let orderType = (parameters.orderType || 'pickup') as string;
    if (orderType === 'delivery' && !deliveryEnabled) {
      orderType = 'pickup';
    } else if (orderType === 'pickup' && !pickupEnabled && deliveryEnabled) {
      orderType = 'delivery';
    }


    // Resolve item names to real POS IDs if the AI passed names instead of IDs
    const menu = await getPOSCachedMenu(businessId);
    const allMenuItems = menu?.categories.flatMap(cat => cat.items) || [];


    const resolvedItems = parameters.items.map(item => {
      const rawId = item.itemId || item.cloverItemId || '';
      // Check if this looks like a real POS ID (alphanumeric, typically 13+ chars)
      const looksLikeRealId = /^[A-Z0-9]{10,}$/.test(rawId);
      if (looksLikeRealId) {
        return item; // Already a real ID
      }

      // Try fuzzy name match against menu items (progressively looser matching)
      const searchName = rawId.toLowerCase().replace(/[_-]/g, ' ').trim();
      const searchWords = searchName.split(/\s+/);

      // 1. Exact match
      let matched = allMenuItems.find(mi => mi.name.toLowerCase() === searchName);

      // 2. Contains match (either direction)
      if (!matched) {
        matched = allMenuItems.find(mi =>
          mi.name.toLowerCase().includes(searchName) ||
          searchName.includes(mi.name.toLowerCase())
        );
      }

      // 3. Word overlap — any word from the search appears in the item name or vice versa
      if (!matched) {
        matched = allMenuItems.find(mi => {
          const itemWords = mi.name.toLowerCase().split(/\s+/);
          return searchWords.some(sw => sw.length > 2 && itemWords.some(iw => iw.includes(sw) || sw.includes(iw)));
        });
      }

      // 4. Singular/plural — try adding/removing trailing 's'
      if (!matched) {
        const variants = searchWords.map(w => w.endsWith('s') ? w.slice(0, -1) : w + 's');
        matched = allMenuItems.find(mi => {
          const itemLower = mi.name.toLowerCase();
          return variants.some(v => itemLower.includes(v));
        });
      }

      if (matched) {
        return { ...item, itemId: matched.id, cloverItemId: matched.id };
      }

      // Check if the AI accidentally passed a category name instead of an item name
      const categoryNames = menu?.categories.map(c => c.name.toLowerCase()) || [];
      if (categoryNames.includes(searchName)) {
        console.warn(`AI passed category name "${rawId}" instead of an item name — will fail on POS`);
      } else {
        console.warn(`Could not resolve item "${rawId}" to any of ${allMenuItems.length} menu items — passing through as-is`);
      }
      return item;
    });

    let result: { success: boolean; orderId?: string; orderTotal?: number; error?: string };

    if (posType === 'square') {
      result = await createSquareOrder(businessId, {
        items: resolvedItems.map(item => ({
          itemId: item.itemId || item.cloverItemId || '',
          quantity: item.quantity,
          modifiers: item.modifiers?.map(m => ({ modifierId: m.modifierId || m.cloverId || '' })),
          notes: item.notes,
        })),
        callerPhone: phone,
        callerName: parameters.callerName,
        orderType: orderType as 'pickup' | 'delivery' | 'dine_in',
        orderNotes: parameters.orderNotes,
      });
    } else if (posType === 'heartland') {
      result = await createHeartlandOrder(businessId, {
        items: resolvedItems.map(item => ({
          itemId: item.itemId || item.cloverItemId || '',
          quantity: item.quantity,
          modifiers: item.modifiers?.map((m: any) => ({ modifierId: m.modifierId || m.cloverId || '' })),
          notes: item.notes,
        })),
        callerPhone: phone,
        callerName: parameters.callerName,
        orderType: orderType as 'pickup' | 'delivery' | 'dine_in',
        orderNotes: parameters.orderNotes,
      });
    } else {
      // Default to Clover
      result = await createCloverOrder(businessId, {
        items: resolvedItems.map(item => ({
          cloverItemId: item.cloverItemId || item.itemId || '',
          quantity: item.quantity,
          modifiers: item.modifiers?.map(m => ({ cloverId: m.cloverId || m.modifierId || '' })),
          notes: item.notes,
        })),
        callerPhone: phone,
        callerName: parameters.callerName,
        orderType: orderType as 'pickup' | 'delivery' | 'dine_in',
        orderNotes: parameters.orderNotes,
      });
    }

    if (result.success) {
      const totalFormatted = result.orderTotal ? `$${(result.orderTotal / 100).toFixed(2)}` : 'calculated at pickup';

      // Save/update customer in our database for marketing purposes
      if (phone) {
        try {
          let customer = await storage.getCustomerByPhone(phone, businessId);
          if (!customer) {
            // Parse caller name into first/last
            const nameParts = (parameters.callerName || '').trim().split(/\s+/);
            const firstName = nameParts[0] || 'Customer';
            const lastName = nameParts.slice(1).join(' ') || '';

            customer = await storage.createCustomer({
              businessId,
              firstName,
              lastName,
              phone,
              email: '',
            });
          } else if (parameters.callerName && customer.firstName === 'Caller') {
            // Update generic name if we now have a real name
            const nameParts = parameters.callerName.trim().split(/\s+/);
            await storage.updateCustomer(customer.id, {
              firstName: nameParts[0],
              lastName: nameParts.slice(1).join(' ') || customer.lastName,
            });
          }
        } catch (custError) {
          console.error('Error saving customer from order:', custError);
          // Don't fail the order response — customer save is non-critical
        }
      }

      // Send order confirmation SMS to the caller (fire and forget — don't block the AI response)
      if (phone) {
        try {
          // Build readable item list from menu cache
          const itemLines = resolvedItems.map(item => {
            const id = item.itemId || item.cloverItemId || '';
            const menuItem = allMenuItems.find(mi => mi.id === id);
            const name = menuItem?.name || id;
            const qty = item.quantity > 1 ? `${item.quantity}x ` : '';
            return `${qty}${name}`;
          });

          const businessName = business?.name || 'the restaurant';
          const smsBody = `Order confirmed from ${businessName}!\n\n` +
            `${itemLines.join('\n')}\n` +
            `Total: ${totalFormatted}\n` +
            `Type: ${orderType === 'delivery' ? 'Delivery' : 'Pickup'}\n\n` +
            `Thank you${parameters.callerName ? ', ' + parameters.callerName : ''}!`;

          // Use the default Twilio number (TWILIO_PHONE_NUMBER env var) for SMS.
          // The business's twilioPhoneNumber is imported into VAPI for voice and may
          // not be registered for A2P 10DLC SMS, causing carrier rejections (error 30034).
          twilioService.sendSms(phone, smsBody, undefined, businessId || undefined).catch(err => {
            console.error(`Failed to send order confirmation SMS to ${phone}:`, err);
          });
        } catch (smsError) {
          console.error('Error building order confirmation SMS:', smsError);
        }
      }

      return {
        result: {
          success: true,
          orderId: result.orderId,
          total: totalFormatted,
          message: `Great news! Your order has been placed successfully. Your order total is ${totalFormatted}. ${
            orderType === 'pickup'
              ? "It'll be ready for pickup shortly. We'll have it waiting for you!"
              : orderType === 'delivery'
              ? "Your delivery is being prepared. You'll receive it soon!"
              : "Your order has been sent to the kitchen!"
          } Is there anything else I can help you with?`
        }
      };
    } else {
      console.error(`POS order failed for business ${businessId}:`, result.error);
      return {
        result: {
          success: false,
          error: result.error,
          message: "I'm sorry, I had trouble placing your order in our system. Would you like me to transfer you to someone who can take your order directly?"
        }
      };
    }
  } catch (error) {
    console.error(`Error creating order for business ${businessId}:`, error);
    return {
      result: {
        error: 'Order creation failed',
        message: "I'm sorry, there was an issue placing your order. Let me transfer you to a staff member who can help. One moment please."
      }
    };
  }
}

// ========================================
// RESTAURANT RESERVATION HANDLERS
// ========================================

/**
 * Check available reservation times for a given date and party size.
 */
export async function handleCheckReservationAvailability(
  businessId: number,
  params: { date: string; partySize: number }
): Promise<any> {
  try {
    const business = await getCachedBusiness(businessId);
    if (!business) return { error: 'Business not found' };

    if (!business.reservationEnabled) {
      return { result: { available: false, message: "I'm sorry, we're not currently accepting reservations online. Please call us directly." } };
    }

    const businessTimezone = business.timezone || 'America/New_York';
    const slotDuration = business.reservationSlotDurationMinutes || 90;
    const slotInterval = business.bookingSlotIntervalMinutes || 30;
    const maxPartySize = business.reservationMaxPartySize || 10;
    const maxDaysAhead = business.reservationMaxDaysAhead || 30;
    const leadTimeHours = business.reservationLeadTimeHours || 2;

    if (params.partySize > maxPartySize) {
      return {
        result: {
          available: false,
          message: `I'm sorry, our maximum party size for online reservations is ${maxPartySize}. For larger groups, I can transfer you to a manager who can help arrange that.`
        }
      };
    }

    // Parse the date
    const parsedDate = parseNaturalDate(params.date, businessTimezone);
    const dateStr = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if date is too far ahead
    const now = new Date();
    const maxFutureDate = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);
    if (parsedDate > maxFutureDate) {
      return {
        result: {
          available: false,
          message: `I'm sorry, we can only take reservations up to ${maxDaysAhead} days in advance. Would you like to try a closer date?`
        }
      };
    }

    // Get business hours for that day
    const businessHours = await getCachedBusinessHours(businessId);
    const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = daysMap[parsedDate.getDay()];
    const dayHours = businessHours.find((h: any) => h.day.toLowerCase() === dayName);

    if (!dayHours || dayHours.isClosed) {
      const friendlyDate = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone });
      return {
        result: {
          available: false,
          date: dateStr,
          friendlyDate,
          message: `I'm sorry, we're closed on ${friendlyDate}. Would you like to try a different date?`
        }
      };
    }

    // Parse open/close hours
    const [openHour, openMin] = (dayHours.open || '09:00').split(':').map(Number);
    const [closeHour, closeMin] = (dayHours.close || '21:00').split(':').map(Number);

    // Minimum booking time (lead time from now)
    const leadTimeMs = leadTimeHours * 60 * 60 * 1000;
    const minBookingTime = new Date(now.getTime() + leadTimeMs);

    // Generate available time slots
    const availableTimes: string[] = [];
    let currentHour = openHour;
    let currentMin = openMin;

    while (true) {
      const slotEndMinutes = currentHour * 60 + currentMin + slotDuration;
      const closeMinutes = closeHour * 60 + closeMin;
      if (slotEndMinutes > closeMinutes) break;

      const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

      // Check if past lead time
      const [year, month, day] = dateStr.split('-').map(Number);
      const slotDateTime = createDateInTimezone(year, month - 1, day, currentHour, currentMin, businessTimezone);

      if (slotDateTime > minBookingTime) {
        // Check capacity
        const capacity = await storage.getReservationSlotCapacity(businessId, dateStr, timeStr, slotDuration);
        if (capacity.remainingSeats >= params.partySize) {
          // Format for voice: "6:30 PM"
          const hour12 = currentHour % 12 || 12;
          const ampm = currentHour >= 12 ? 'PM' : 'AM';
          const minStr = currentMin > 0 ? `:${String(currentMin).padStart(2, '0')}` : '';
          availableTimes.push(`${hour12}${minStr} ${ampm}`);
        }
      }

      // Advance by slot interval
      currentMin += slotInterval;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
    }

    const friendlyDate = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone });
    const tzAbbr = getTimezoneAbbreviation(businessTimezone, parsedDate);

    if (availableTimes.length === 0) {
      return {
        result: {
          available: false,
          date: dateStr,
          friendlyDate,
          message: `I'm sorry, we don't have availability for a party of ${params.partySize} on ${friendlyDate}. Would you like to try a different date or a smaller party size?`
        }
      };
    }

    return {
      result: {
        available: true,
        date: dateStr,
        friendlyDate,
        partySize: params.partySize,
        availableTimes,
        timezone: tzAbbr,
        message: `We have ${availableTimes.length} time${availableTimes.length > 1 ? 's' : ''} available on ${friendlyDate} for a party of ${params.partySize}: ${availableTimes.slice(0, 5).join(', ')}${availableTimes.length > 5 ? ` and ${availableTimes.length - 5} more` : ''}.`
      }
    };
  } catch (error) {
    console.error(`Error checking reservation availability for business ${businessId}:`, error);
    return { error: 'Failed to check reservation availability' };
  }
}

/**
 * Make a reservation after the customer confirms all details.
 */
export async function handleMakeReservation(
  businessId: number,
  params: { date: string; time: string; partySize: number; customerName: string; specialRequests?: string },
  callerPhone: string
): Promise<any> {
  try {
    const business = await getCachedBusiness(businessId);
    if (!business) return { error: 'Business not found' };

    if (!business.reservationEnabled) {
      return { result: { success: false, message: "I'm sorry, we're not currently accepting reservations." } };
    }

    const businessTimezone = business.timezone || 'America/New_York';
    const slotDuration = business.reservationSlotDurationMinutes || 90;

    // Normalize time format — AI might send "6:30 PM" or "18:30" or "6:30pm"
    let normalizedTime = params.time;
    const timeMatch = params.time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const min = parseInt(timeMatch[2] || '0');
      const ampm = (timeMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      normalizedTime = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    // Parse date
    let dateStr = params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parsed = parseNaturalDate(dateStr, businessTimezone);
      dateStr = parsed.toISOString().split('T')[0];
    }

    // Re-verify capacity (race condition prevention)
    const capacity = await storage.getReservationSlotCapacity(businessId, dateStr, normalizedTime, slotDuration);
    if (capacity.remainingSeats < params.partySize) {
      return {
        result: {
          success: false,
          message: "I'm sorry, that time slot just filled up. Would you like me to check for another available time?"
        }
      };
    }

    // Find or create customer by phone
    const phone = callerPhone || '';
    let customer = phone ? await storage.getCustomerByPhone(phone, businessId) : null;

    // Parse customer name
    const nameParts = params.customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Guest';
    const lastName = nameParts.slice(1).join(' ') || '';

    if (!customer && phone) {
      customer = await storage.createCustomer({
        businessId,
        firstName,
        lastName,
        phone,
        email: null,
      });
    } else if (customer) {
      // Update name if provided
      if (firstName !== 'Guest') {
        customer = await storage.updateCustomer(customer.id, { firstName, lastName });
      }
    }

    if (!customer) {
      return {
        result: {
          success: false,
          message: "I'm sorry, I wasn't able to save your information. Could you give me your phone number?"
        }
      };
    }

    // Check for duplicate reservation
    const existingReservations = await storage.getRestaurantReservations(businessId, {
      date: dateStr,
      customerId: customer.id,
    });
    const activeDuplicate = existingReservations.find(r => r.status !== 'cancelled' && r.status !== 'no_show');
    if (activeDuplicate) {
      return {
        result: {
          success: false,
          message: `It looks like you already have a reservation on this date. Would you like me to modify it instead?`
        }
      };
    }

    // Calculate start/end dates
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, min] = normalizedTime.split(':').map(Number);
    const startDate = createDateInTimezone(year, month - 1, day, hour, min, businessTimezone);
    const endDate = new Date(startDate.getTime() + slotDuration * 60 * 1000);

    // Create reservation
    const crypto = await import('crypto');
    const manageToken = crypto.randomBytes(24).toString('hex');

    const reservation = await storage.createRestaurantReservation({
      businessId,
      customerId: customer.id,
      partySize: params.partySize,
      reservationDate: dateStr,
      reservationTime: normalizedTime,
      startDate,
      endDate,
      status: 'confirmed',
      specialRequests: params.specialRequests || null,
      manageToken,
      source: 'phone',
    });

    // Fire webhook
    fireEvent(businessId, 'reservation.created', { reservation }).catch(logAndSwallow('CallTools'));

    // Send SMS confirmation (fire-and-forget)
    if (phone) {
      try {
        const friendlyDate = startDate.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone
        });
        const friendlyTime = startDate.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true, timeZone: businessTimezone
        });
        const manageUrl = business.bookingSlug
          ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}/manage-reservation/${manageToken}`
          : null;
        const smsMessage = manageUrl
          ? `Your reservation for ${params.partySize} at ${business.name} is confirmed for ${friendlyDate} at ${friendlyTime}. Manage: ${manageUrl}`
          : `Your reservation for ${params.partySize} at ${business.name} is confirmed for ${friendlyDate} at ${friendlyTime}.`;
        twilioService.sendSms(phone, smsMessage, undefined, businessId || undefined).catch(e =>
          console.error('Failed to send reservation SMS:', e));
      } catch (e) {
        console.error('Error building reservation SMS:', e);
      }
    }

    const friendlyDate = startDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone
    });
    const friendlyTime = startDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: businessTimezone
    });

    return {
      result: {
        success: true,
        reservationId: reservation.id,
        date: friendlyDate,
        time: friendlyTime,
        partySize: params.partySize,
        customerName: params.customerName,
        message: `Your reservation for ${params.partySize} on ${friendlyDate} at ${friendlyTime} is confirmed. You'll receive a text confirmation shortly.`
      }
    };
  } catch (error) {
    console.error(`Error making reservation for business ${businessId}:`, error);
    return {
      result: {
        success: false,
        message: "I'm sorry, I had trouble making your reservation. Would you like me to try again?"
      }
    };
  }
}

/**
 * Cancel an existing reservation.
 */
export async function handleCancelReservation(
  businessId: number,
  params: { customerName: string; date?: string },
  callerPhone: string
): Promise<any> {
  try {
    const business = await getCachedBusiness(businessId);
    if (!business) return { error: 'Business not found' };

    const businessTimezone = business.timezone || 'America/New_York';

    // Look up by phone number first
    const phone = callerPhone || '';
    let customer = phone ? await storage.getCustomerByPhone(phone, businessId) : null;

    // If phone lookup fails, try finding by customer name
    if (!customer && params.customerName) {
      const allCustomers = await storage.getCustomers(businessId);
      const nameParts = params.customerName.trim().toLowerCase().split(/\s+/);

      // Try exact full name match first
      customer = allCustomers.find(c => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
        return fullName === params.customerName.trim().toLowerCase();
      }) || null;

      // If no exact match, try partial matching (first name or last name)
      if (!customer && nameParts.length >= 1) {
        const matches = allCustomers.filter(c => {
          const first = c.firstName.toLowerCase();
          const last = c.lastName.toLowerCase();
          // Match if any provided name part matches first or last name
          return nameParts.some(part => first === part || last === part);
        });

        if (matches.length === 1) {
          // Only use if there's exactly one match to avoid cancelling wrong person's reservation
          customer = matches[0];
        } else if (matches.length > 1) {
          // Multiple matches — ask for clarification
          const names = matches.map(c => `${c.firstName} ${c.lastName}`).join(', ');
          return {
            result: {
              success: false,
              message: `I found multiple customers with that name: ${names}. Could you provide the full name or the phone number on the reservation?`
            }
          };
        }
      }
    }

    if (!customer) {
      return {
        result: {
          success: false,
          message: "I couldn't find a reservation under that name or phone number. Could you provide the full name on the reservation?"
        }
      };
    }

    // Get upcoming reservations for this customer
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: businessTimezone }); // YYYY-MM-DD

    // If a specific date was given, use that; otherwise look at all upcoming
    let targetDate: string | undefined;
    if (params.date) {
      const parsedDate = parseNaturalDate(params.date, businessTimezone);
      targetDate = parsedDate.toISOString().split('T')[0];
    }

    const reservations = await storage.getRestaurantReservations(businessId, {
      customerId: customer.id,
      date: targetDate,
    });

    // Filter to upcoming, non-cancelled reservations
    const upcomingReservations = reservations.filter(r =>
      r.status !== 'cancelled' &&
      r.status !== 'no_show' &&
      r.status !== 'completed' &&
      r.reservationDate >= todayStr
    );

    if (upcomingReservations.length === 0) {
      return {
        result: {
          success: false,
          message: "I couldn't find any upcoming reservations for you. Is there anything else I can help with?"
        }
      };
    }

    // Cancel the most recent/relevant reservation
    const toCancel = upcomingReservations[0];
    await storage.updateRestaurantReservation(toCancel.id, { status: 'cancelled' });

    fireEvent(businessId, 'reservation.cancelled', { reservation: toCancel }).catch(logAndSwallow('CallTools'));

    const friendlyDate = new Date(toCancel.startDate).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: businessTimezone
    });
    const friendlyTime = new Date(toCancel.startDate).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: businessTimezone
    });

    return {
      result: {
        success: true,
        message: `Your reservation for ${toCancel.partySize} on ${friendlyDate} at ${friendlyTime} has been cancelled. Is there anything else I can help with?`
      }
    };
  } catch (error) {
    console.error(`Error cancelling reservation for business ${businessId}:`, error);
    return {
      result: {
        success: false,
        message: "I'm sorry, I had trouble cancelling your reservation. Would you like me to transfer you to a staff member?"
      }
    };
  }
}
