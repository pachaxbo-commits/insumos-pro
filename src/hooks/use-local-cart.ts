"use client";

import { useSyncExternalStore } from "react";

import type { LocalCatalogCartItem } from "@/types/catalog";

const STORAGE_KEY = "insumos-pro:catalog-cart:v1";
const CART_EVENT = "insumos-pro:catalog-cart-change";
const EMPTY_CART: LocalCatalogCartItem[] = [];

let cachedValue: string | null = null;
let cachedItems: LocalCatalogCartItem[] = EMPTY_CART;

function parseCart(value: string | null) {
  if (!value) return EMPTY_CART;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return EMPTY_CART;

    return parsed
      .filter(
        (item): item is LocalCatalogCartItem =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as LocalCatalogCartItem).productId === "string" &&
          Number.isFinite(Number((item as LocalCatalogCartItem).quantity)) &&
          Number((item as LocalCatalogCartItem).quantity) > 0,
      )
      .map((item) => {
        const allowedUnitId = item.allowedUnitId;
        const notes = item.notes;

        return {
          productId: item.productId,
          allowedUnitId: typeof allowedUnitId === "string" ? allowedUnitId : undefined,
          quantity: Math.round(Number(item.quantity) * 1000) / 1000,
          notes: typeof notes === "string" ? notes.slice(0, 500) : undefined,
        };
      });
  } catch {
    return EMPTY_CART;
  }
}

function readCartSnapshot() {
  if (typeof window === "undefined") return EMPTY_CART;

  let value: string | null;

  try {
    value = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_CART;
  }

  if (value !== cachedValue) {
    cachedValue = value;
    cachedItems = parseCart(value);
  }

  return cachedItems;
}

function subscribeToCart(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  const handleCartChange = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CART_EVENT, handleCartChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CART_EVENT, handleCartChange);
  };
}

export function saveLocalCart(items: LocalCatalogCartItem[]) {
  const normalizedItems = items
    .filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0)
    .map((item) => ({
      productId: item.productId,
      allowedUnitId: item.allowedUnitId,
      quantity: Math.round(item.quantity * 1000) / 1000,
      notes: item.notes?.trim() ? item.notes.trim().slice(0, 500) : undefined,
    }));
  const value = JSON.stringify(normalizedItems);

  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    cachedValue = value;
    cachedItems = normalizedItems;
    window.dispatchEvent(new Event(CART_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function useLocalCart() {
  return useSyncExternalStore(subscribeToCart, readCartSnapshot, () => EMPTY_CART);
}
