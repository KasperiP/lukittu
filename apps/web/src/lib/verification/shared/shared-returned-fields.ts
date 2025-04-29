import {
  Customer,
  License,
  LicenseExpirationStart,
  LicenseExpirationType,
  Metadata,
  Product,
  Release,
  ReturnedFields,
} from '@lukittu/shared';

type MetadataField = { key: string; value: string };

interface GetReturnedFields {
  returnedFields: ReturnedFields | null;
  license: Omit<License & { metadata: Metadata[] }, 'licenseKeyLookup'> & {
    customers: Array<Customer & { metadata: Metadata[] }>;
    products: Array<Product & { metadata: Metadata[]; releases: Release[] }>;
  };
}

interface ReturnedFieldsData {
  license?: {
    ipLimit?: number | null;
    seats?: number | null;
    expirationType?: LicenseExpirationType;
    expirationStart?: LicenseExpirationStart;
    expirationDate?: Date | null;
    expirationDays?: number | null;
    metadata?: MetadataField[];
  };
  customers?: CustomerReturnedData[];
  products?: ProductReturnedData[];
}

interface CustomerReturnedData {
  email?: string;
  fullName?: string;
  username?: string;
  metadata?: MetadataField[];
}

interface ProductReturnedData {
  name?: string;
  url?: string;
  latestRelease?: {
    version: string;
    createdAt: Date;
  };
  metadata?: MetadataField[];
}

export const getReturnedFields = ({
  returnedFields,
  license,
}: GetReturnedFields): ReturnedFieldsData | null => {
  // If no returned fields settings exist, return null
  if (!returnedFields) return null;

  // Create response object to populate with allowed data
  const response: ReturnedFieldsData = {};

  // Add license fields based on returnedFields settings
  const licenseData: ReturnedFieldsData['license'] = {};

  if (returnedFields.licenseIpLimit && license.ipLimit !== undefined) {
    licenseData.ipLimit = license.ipLimit;
  }

  if (returnedFields.licenseSeats && license.seats !== undefined) {
    licenseData.seats = license.seats;
  }

  if (returnedFields.licenseExpirationType) {
    licenseData.expirationType = license.expirationType;
  }

  if (returnedFields.licenseExpirationStart) {
    licenseData.expirationStart = license.expirationStart;
  }

  if (returnedFields.licenseExpirationDate && license.expirationDate) {
    licenseData.expirationDate = license.expirationDate;
  }

  if (returnedFields.licenseExpirationDays && license.expirationDays) {
    licenseData.expirationDays = license.expirationDays;
  }

  // Add license metadata if keys are allowed
  if (
    returnedFields.licenseMetadataKeys.length > 0 &&
    license.metadata.length > 0
  ) {
    licenseData.metadata = license.metadata
      .filter((m) => returnedFields.licenseMetadataKeys.includes(m.key))
      .map(({ key, value }) => ({ key, value }));
  }

  if (Object.keys(licenseData).length > 0) {
    response.license = licenseData;
  }

  // Add customer data if allowed
  if (license.customers.length > 0) {
    const customersData: CustomerReturnedData[] = [];

    for (const customer of license.customers) {
      const customerData: CustomerReturnedData = {};

      if (returnedFields.customerEmail && customer.email) {
        customerData.email = customer.email;
      }

      if (returnedFields.customerFullName && customer.fullName) {
        customerData.fullName = customer.fullName;
      }

      if (returnedFields.customerUsername && customer.username) {
        customerData.username = customer.username;
      }

      // Add customer metadata if keys are allowed
      if (
        returnedFields.customerMetadataKeys.length > 0 &&
        customer.metadata.length > 0
      ) {
        customerData.metadata = customer.metadata
          .filter((m) => returnedFields.customerMetadataKeys.includes(m.key))
          .map(({ key, value }) => ({ key, value }));
      }

      // Only add customer if any data is included
      if (Object.keys(customerData).length > 0) {
        customersData.push(customerData);
      }
    }

    if (customersData.length > 0) {
      response.customers = customersData;
    }
  }

  // Add product data if allowed
  if (license.products.length > 0) {
    const productsData: ProductReturnedData[] = [];

    for (const product of license.products) {
      const productData: ProductReturnedData = {};

      if (returnedFields.productName) {
        productData.name = product.name;
      }

      if (returnedFields.productUrl && product.url) {
        productData.url = product.url;
      }

      // Add latest release if allowed
      if (returnedFields.productLatestRelease) {
        const latestRelease = product.releases?.find((r) => r.latest);
        if (latestRelease) {
          productData.latestRelease = {
            version: latestRelease.version,
            createdAt: latestRelease.createdAt,
          };
        }
      }

      // Add product metadata if keys are allowed
      if (
        returnedFields.productMetadataKeys.length > 0 &&
        product.metadata.length > 0
      ) {
        productData.metadata = product.metadata
          .filter((m) => returnedFields.productMetadataKeys.includes(m.key))
          .map(({ key, value }) => ({ key, value }));
      }

      // Only add product if any data is included
      if (Object.keys(productData).length > 0) {
        productsData.push(productData);
      }
    }

    if (productsData.length > 0) {
      response.products = productsData;
    }
  }

  // Return null if no data was added to response
  return Object.keys(response).length > 0 ? response : null;
};
