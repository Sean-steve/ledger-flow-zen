import { StorageService } from '../infrastructure/storage';
import { BusinessEntity, ClientEntity } from '../types';

export function seedBusiness(overrides: Partial<BusinessEntity> = {}): BusinessEntity {
  const biz: BusinessEntity = {
    id: 'biz-test-01',
    name: 'Test Trading Co Ltd',
    tradingName: 'Test Trading',
    kraPin: 'P000000000A',
    vatNumber: '',
    email: 'billing@testtrading.example',
    phone: '+254700000000',
    physicalAddress: '1 Test Street',
    city: 'Nairobi',
    country: 'Kenya',
    currency: 'KES',
    authorizedSignatoryName: 'Jane Test',
    authorizedSignatoryTitle: 'Director',
    ...overrides,
  };
  StorageService.saveBusiness(biz);
  return biz;
}

export function seedClient(overrides: Partial<ClientEntity> = {}): ClientEntity {
  const client: ClientEntity = {
    id: `client-test-${Math.random().toString(36).slice(2, 8)}`,
    businessId: 'biz-test-01',
    name: 'Acme Test Client',
    contactPerson: 'John Doe',
    email: 'john@acmetest.example',
    phone: '+254711111111',
    kraPin: 'A000000000B',
    address: '2 Client Ave',
    city: 'Nairobi',
    country: 'Kenya',
    currency: 'KES',
    paymentTermsDays: 30,
    totalInvoiced: '0.00',
    totalPaid: '0.00',
    outstandingBalance: '0.00',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  const clients = StorageService.getClients();
  clients.push(client);
  StorageService.saveClients(clients);
  return client;
}

export function resetWorkspace(): void {
  localStorage.clear();
}
