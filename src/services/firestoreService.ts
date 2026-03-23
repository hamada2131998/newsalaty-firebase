import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, doc, setDoc, deleteDoc,
  orderBy, limit, getDoc, updateDoc
} from "firebase/firestore";
import { db, auth } from "../firebase";

// ═══════════════════════════════════════
// Orders
// ═══════════════════════════════════════
export const subscribeToAllOrders = (cb: (o: any[]) => void) =>
  onSnapshot(
    query(collection(db, "orders"), orderBy("created_at", "desc"), limit(50)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const createOrder = async (
  userId: string, totalAmount: number, totalSavings: number, pointsEarned: number
) => {
  await addDoc(collection(db, "orders"), {
    customer_id: userId, customerId: userId,
    status: "confirmed",
    total_amount: totalAmount, totalAmount,
    total_savings: totalSavings, totalSavings,
    points_earned: pointsEarned,
    created_at: serverTimestamp(), createdAt: serverTimestamp(),
    source: "dashboard",
  });
};

// ═══════════════════════════════════════
// Customers
// ═══════════════════════════════════════
export const subscribeToCustomers = (cb: (c: any[]) => void) =>
  onSnapshot(
    query(collection(db, "customers"), orderBy("total_orders", "desc"), limit(50)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const subscribeToLoyalty = (userId: string, cb: (l: any) => void) =>
  onSnapshot(doc(db, "loyalty_accounts", userId), snap => cb(snap.data()));

export const subscribeToProfile = (userId: string, cb: (p: any) => void) =>
  onSnapshot(doc(db, "customer_profiles", userId), snap => cb(snap.data()));

// ═══════════════════════════════════════
// Products / Market Offers
// ═══════════════════════════════════════
export const subscribeToProducts = (cb: (p: any[]) => void) =>
  onSnapshot(
    query(collection(db, "products"), orderBy("name", "asc")),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const subscribeToMarketOffers = (cb: (o: any[]) => void) =>
  onSnapshot(
    collection(db, "market_offers"),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const addProduct = async (product: any) =>
  addDoc(collection(db, "products"), { ...product, createdAt: serverTimestamp() });

export const updateProduct = async (id: string, data: any) =>
  setDoc(doc(db, "products", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });

export const deleteProduct = async (id: string) =>
  deleteDoc(doc(db, "products", id));

export const saveMarketOffer = async (offer: any) => {
  const id = Buffer.from(offer.productName + offer.marketName).toString("base64").slice(0, 20);
  await setDoc(doc(db, "market_offers", id), { ...offer, updatedAt: serverTimestamp() }, { merge: true });
};
