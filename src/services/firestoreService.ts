import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc,
  setDoc,
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const subscribeToOrders = (userId: string, callback: (orders: any[]) => void) => {
  const q = query(
    collection(db, 'orders'), 
    where('customerId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(orders);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'orders');
  });
};

export const subscribeToLoyalty = (userId: string, callback: (loyalty: any) => void) => {
  const docRef = doc(db, 'loyalty_accounts', userId);
  return onSnapshot(docRef, (snapshot) => {
    callback(snapshot.data());
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `loyalty_accounts/${userId}`);
  });
};

export const subscribeToProfile = (userId: string, callback: (profile: any) => void) => {
  const docRef = doc(db, 'customer_profiles', userId);
  return onSnapshot(docRef, (snapshot) => {
    callback(snapshot.data());
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `customer_profiles/${userId}`);
  });
};

export const subscribeToAllOrders = (callback: (orders: any[]) => void) => {
  const q = query(
    collection(db, 'orders'), 
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(orders);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'orders');
  });
};

export const createOrder = async (userId: string, totalAmount: number, totalSavings: number, pointsEarned: number) => {
  try {
    const orderData = {
      customerId: userId,
      status: 'pending',
      totalAmount,
      totalSavings,
      pointsEarned,
      createdAt: serverTimestamp(),
      deliveryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow
    };
    await addDoc(collection(db, 'orders'), orderData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'orders');
  }
};

export const subscribeToProducts = (callback: (products: any[]) => void) => {
  const q = query(collection(db, 'products'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(products);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'products');
  });
};

export const addProduct = async (product: any) => {
  try {
    await addDoc(collection(db, 'products'), {
      ...product,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'products');
  }
};

export const updateProduct = async (productId: string, product: any) => {
  try {
    const docRef = doc(db, 'products', productId);
    await setDoc(docRef, { ...product, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `products/${productId}`);
  }
};

export const deleteProduct = async (productId: string) => {
  try {
    const docRef = doc(db, 'products', productId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
  }
};
