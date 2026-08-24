export const openapiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Last-Mile Delivery Tracker API',
    version: '1.0.0',
    description:
      'REST API for the Last-Mile Delivery Tracker: authentication, quoting, orders, tracking, agents, assignment and admin configuration. All endpoints except /auth/register and /auth/login require a Bearer JWT.',
  },
  servers: [{ url: 'http://localhost:4000' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth' }, { name: 'Quotes' }, { name: 'Orders' }, { name: 'Tracking' },
    { name: 'Agents' }, { name: 'Assignments' }, { name: 'Zones' }, { name: 'Rate Cards' },
    { name: 'COD' }, { name: 'Admin' },
  ],
  paths: {
    '/api/auth/register': { post: op('Auth', 'Register a customer account', ['name', 'email', 'password', 'phone']) },
    '/api/auth/login': { post: op('Auth', 'Log in and receive a JWT', ['email', 'password']) },
    '/api/auth/me': { get: op('Auth', 'Current user profile') },
    '/api/quotes': { post: op('Quotes', 'Price a shipment before booking (transparent breakdown)', ['serviceType', 'paymentType', 'lengthCm', 'breadthCm', 'heightCm', 'actualWeightKg', 'declaredValue', 'pickupPostalCode', 'dropPostalCode']) },
    '/api/orders': {
      get: op('Orders', 'List orders scoped by role; admin filters: status, zoneId, agentId, customerId, search'),
      post: op('Orders', 'Create an order (customer, or admin on behalf of a customer)'),
    },
    '/api/orders/{id}': { get: op('Orders', 'Order detail') },
    '/api/orders/{id}/tracking': { get: op('Tracking', 'Immutable status timeline, attempts and assignments') },
    '/api/orders/{id}/status': { patch: op('Orders', 'Agent status update, or admin override', ['status', 'note', 'failureReason', 'override']) },
    '/api/orders/{id}/reschedule': { post: op('Orders', 'Reschedule a failed delivery; opens a new attempt', ['scheduledDate', 'note']) },
    '/api/agents': { get: op('Agents', 'List agents (admin)') },
    '/api/agents/me': { get: op('Agents', 'Own agent profile') },
    '/api/agents/me/availability': { patch: op('Agents', 'Set AVAILABLE / BUSY / OFFLINE', ['status']) },
    '/api/agents/me/location': { patch: op('Agents', 'Update current coordinates', ['latitude', 'longitude']) },
    '/api/agents/me/orders': { get: op('Agents', 'Orders currently assigned to the agent') },
    '/api/agents/{id}': { patch: op('Agents', 'Admin update of an agent profile') },
    '/api/assignments/orders/{id}/assign': { post: op('Assignments', 'Assign an agent — manual with agentId, automatic nearest-agent without', ['agentId']) },
    '/api/assignments/orders/{id}/assignments': { get: op('Assignments', 'Assignment history for an order') },
    '/api/zones': { get: op('Zones', 'List zones with postal-code areas'), post: op('Zones', 'Create a zone') },
    '/api/zones/{id}': { patch: op('Zones', 'Update a zone') },
    '/api/zones/{id}/areas': { post: op('Zones', 'Map a postal code to a zone', ['postalCode', 'areaName']) },
    '/api/zones/areas/{areaId}': { delete: op('Zones', 'Remove a postal-code mapping') },
    '/api/rate-cards': { get: op('Rate Cards', 'List rate cards with intra/inter rules'), post: op('Rate Cards', 'Create a rate card') },
    '/api/rate-cards/{id}': { patch: op('Rate Cards', 'Update rate card header (fuel %, tax %, divisor, active)') },
    '/api/rate-cards/{id}/rules': { put: op('Rate Cards', 'Upsert the INTRA_ZONE / INTER_ZONE rule', ['scope', 'baseCharge', 'includedWeightKg', 'perKgCharge', 'minCharge']) },
    '/api/cod': { get: op('COD', 'List COD surcharge configurations'), post: op('COD', 'Create a COD surcharge') },
    '/api/cod/{id}': { patch: op('COD', 'Update a COD surcharge') },
    '/api/admin/stats': { get: op('Admin', 'Dashboard counters and recent orders') },
    '/api/admin/customers': { get: op('Admin', 'List customers') },
    '/api/admin/notifications': { get: op('Admin', 'Notification event log') },
    '/api/admin/agents': { post: op('Admin', 'Create an agent account and profile') },
  },
};

function op(tag: string, summary: string, bodyFields?: string[]) {
  return {
    tags: [tag],
    summary,
    ...(bodyFields
      ? {
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: Object.fromEntries(bodyFields.map((f) => [f, {}])),
                },
              },
            },
          },
        }
      : {}),
    responses: { '200': { description: 'Success' }, '400': { description: 'Validation error' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' }, '409': { description: 'Conflict' } },
  };
}
