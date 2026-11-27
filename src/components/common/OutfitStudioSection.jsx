import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ShoppingBag, Check, Plus, AlertCircle } from 'lucide-react';
import { OUTFITS } from '../../data/outfitsData';
import { productService } from '../../services/api';
import { useCartStore } from '../../store/useCartStore';
import { useToastStore } from '../../store/useToastStore';

function parseProductSizes(backendProd, fallbackSizes) {
  const specSizes = backendProd?.specifications?.Sizes || backendProd?.specifications?.sizes;
  if (typeof specSizes === 'string' && specSizes.trim()) {
    const parsed = specSizes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  if (Array.isArray(backendProd?.sizes) && backendProd.sizes.length > 0) {
    return backendProd.sizes;
  }
  return fallbackSizes || ['M'];
}

export default function OutfitStudioSection({ isStandalonePage = false }) {
  const { addItem } = useCartStore();
  const { addToast } = useToastStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [direction, setDirection] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Live backend products keyed by slug
  const [backendBySlug, setBackendBySlug] = useState({});
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  const [catalogueError, setCatalogueError] = useState(false);

  // Selected sizes keyed by hotspot id: { [hotspotId]: 'M' }
  const [selectedSizes, setSelectedSizes] = useState({});
  // Feedback states
  const [addingItemId, setAddingItemId] = useState(null);
  const [addedItemIds, setAddedItemIds] = useState({});
  const [isAddingFullLook, setIsAddingFullLook] = useState(false);
  const [fullLookAdded, setFullLookAdded] = useState(false);

  // Touch swipe tracking for mobile
  const touchStartXRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const rowRefs = useRef({});

  const totalLooks = OUTFITS.length;
  const prevIndex = (currentIndex - 1 + totalLooks) % totalLooks;
  const nextIndex = (currentIndex + 1) % totalLooks;

  const baseActiveOutfit = OUTFITS[currentIndex] || OUTFITS[0];
  const prevOutfit = OUTFITS[prevIndex];
  const nextOutfit = OUTFITS[nextIndex];

  // Fetch live backend products so prices, stock, and availability are 100% real
  useEffect(() => {
    let isMounted = true;
    async function loadCatalogue() {
      try {
        const res = await productService.getAll({ page_size: 100 });
        if (!isMounted) return;
        const items = res?.items || [];
        const map = {};
        items.forEach((prod) => {
          if (prod?.slug) map[prod.slug] = prod;
        });
        setBackendBySlug(map);
        setCatalogueLoaded(true);
        setCatalogueError(false);
      } catch (err) {
        if (!isMounted) return;
        console.warn('Could not sync live backend catalogue for Outfit Studio:', err);
        setCatalogueError(true);
        setCatalogueLoaded(true);
      }
    }
    loadCatalogue();
    return () => {
      isMounted = false;
    };
  }, []);

  // Preload all 6 male model editorial images
  useEffect(() => {
    OUTFITS.forEach((outfit) => {
      const img = new Image();
      img.src = outfit.modelImage;
    });
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  // Hydrate active look products with live backend data
  const activeProducts = useMemo(() => {
    const hasLiveMap = Object.keys(backendBySlug).length > 0;
    return (baseActiveOutfit.hotspots || []).map((spot) => {
      const live = backendBySlug[spot.slug];
      if (live) {
        const stockCount =
          live.available_stock !== undefined
            ? Number(live.available_stock)
            : Number(live.stock ?? 0);
        const isPublished = !live.status || live.status === 'PUBLISHED';
        const sizes = parseProductSizes(live, spot.sizes);
        const primaryImg =
          live.image_url ||
          live.images?.find((im) => im?.is_primary)?.image_url ||
          live.images?.[0]?.image_url ||
          spot.image;

        return {
          ...spot,
          productId: live.id,
          name: live.name || spot.name,
          price: Math.round(Number(live.price ?? spot.price)),
          compareAtPrice: live.compare_at_price
            ? Math.round(Number(live.compare_at_price))
            : spot.compareAtPrice,
          sku: live.sku || spot.sku,
          sizes,
          defaultSize: sizes.includes(spot.defaultSize) ? spot.defaultSize : sizes[0],
          stockCount,
          inStock: isPublished && stockCount > 0,
          existsInDb: true,
          image: primaryImg || spot.image,
        };
      }

      // If backend responded with real products and this slug wasn't found, mark unavailable
      if (catalogueLoaded && !catalogueError && hasLiveMap) {
        return {
          ...spot,
          inStock: false,
          stockCount: 0,
          existsInDb: false,
        };
      }

      return {
        ...spot,
        existsInDb: true,
      };
    });
  }, [baseActiveOutfit, backendBySlug, catalogueLoaded, catalogueError]);

  // Reset selected pin & feedback when look changes
  useEffect(() => {
    setSelectedPinId(activeProducts[0]?.id || null);
    setFullLookAdded(false);
    setAddedItemIds({});
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchLook = useCallback(
    (targetIdx, dir) => {
      if (isTransitioning || targetIdx === currentIndex) return;
      setIsTransitioning(true);
      setDirection(dir);
      setCurrentIndex(targetIdx);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, 340);
    },
    [isTransitioning, currentIndex]
  );

  const handlePrev = useCallback(() => {
    switchLook(prevIndex, -1);
  }, [prevIndex, switchLook]);

  const handleNext = useCallback(() => {
    switchLook(nextIndex, 1);
  }, [nextIndex, switchLook]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handlePrev]);

  // Mobile swipe handlers
  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;
    const endX = e.changedTouches?.[0]?.clientX;
    if (endX === undefined) return;
    const delta = touchStartXRef.current - endX;
    if (delta > 45) handleNext();
    else if (delta < -45) handlePrev();
    touchStartXRef.current = null;
  };

  const getSelectedSize = (item) =>
    selectedSizes[item.id] || item.defaultSize || item.sizes?.[0] || 'M';

  const handleSizeChange = (itemId, size) => {
    setSelectedSizes((prev) => ({ ...prev, [itemId]: size }));
  };

  const handlePinSelect = (item) => {
    setSelectedPinId(item.id);
    const rowEl = rowRefs.current[item.id];
    if (rowEl && window.innerWidth < 1024) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleAddSingleItem = async (item) => {
    if (!item.inStock || !item.existsInDb || addingItemId === item.id) return;
    const chosenSize = getSelectedSize(item);
    setAddingItemId(item.id);

    try {
      await addItem(item.productId, 1, {
        id: item.productId,
        name: item.name,
        price: item.price,
        compare_at_price: item.compareAtPrice,
        slug: item.slug,
        image_url: item.image,
        images: [{ image_url: item.image }],
        selectedSize: chosenSize,
        size: chosenSize,
        selectedColor: item.color,
        color: item.color,
        sku: item.sku,
        available_stock: item.stockCount,
      });
      setAddedItemIds((prev) => ({ ...prev, [item.id]: true }));
      setTimeout(() => {
        setAddedItemIds((prev) => ({ ...prev, [item.id]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to add outfit item to cart:', err);
      addToast('Could not add item to cart. Please try again.', 'error');
    } finally {
      setAddingItemId(null);
    }
  };

  const availableProducts = activeProducts.filter((p) => p.inStock && p.existsInDb);
  const fullLookPrice = availableProducts.reduce((sum, p) => sum + (p.price || 0), 0);

  const handleAddFullLook = async () => {
    if (isAddingFullLook || availableProducts.length === 0) return;
    setIsAddingFullLook(true);

    try {
      let addedCount = 0;
      for (const item of availableProducts) {
        const chosenSize = getSelectedSize(item);
        await addItem(item.productId, 1, {
          id: item.productId,
          name: item.name,
          price: item.price,
          compare_at_price: item.compareAtPrice,
          slug: item.slug,
          image_url: item.image,
          images: [{ image_url: item.image }],
          selectedSize: chosenSize,
          size: chosenSize,
          selectedColor: item.color,
          color: item.color,
          sku: item.sku,
          available_stock: item.stockCount,
        });
        addedCount += 1;
      }

      if (addedCount > 0) {
        setFullLookAdded(true);
        addToast(`Added ${addedCount} items from "${baseActiveOutfit.name}" to your bag!`, 'success');
        setTimeout(() => setFullLookAdded(false), 2500);
      }
    } catch (err) {
      console.error('Failed to add full look:', err);
      addToast('Could not add full look to bag. Please try again.', 'error');
    } finally {
      setIsAddingFullLook(false);
    }
  };

  const activePinnedItem =
    activeProducts.find((p) => p.id === selectedPinId) || activeProducts[0] || null;

  return (
    <section
      aria-label="Interactive Men's Outfit Showcase"
      className={`w-full bg-white text-neutral-900 overflow-x-hidden ${
        isStandalonePage ? 'py-6 sm:py-10' : 'py-8 sm:py-12 border-t border-neutral-100'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* =====================================================================
              LEFT SECTION: 3 MALE MODELS CAROUSEL + NUMBERED INTERACTIVE PINS
              ===================================================================== */}
          <div
            className="lg:col-span-7 relative flex flex-col items-center select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* 3-Model Stage: Prev (small) | Active (large center) | Next (small) */}
            <div className="relative w-full flex items-center justify-center gap-2 sm:gap-4 h-[440px] sm:h-[540px] lg:h-[600px]">
              {/* Previous Model Preview (Desktop & Tablet) */}
              <button
                type="button"
                onClick={handlePrev}
                disabled={isTransitioning}
                aria-label={`Previous look: ${prevOutfit.name}`}
                className="hidden sm:flex flex-col items-center justify-center w-[22%] h-[68%] opacity-50 hover:opacity-85 transition-all duration-300 cursor-pointer group focus:outline-none"
              >
                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                  <img
                    src={prevOutfit.modelImage}
                    alt={prevOutfit.name}
                    className="w-full h-full object-contain object-center transition-transform duration-300 group-hover:scale-105"
                    draggable={false}
                  />
                </div>
                <span className="mt-1.5 text-[10px] font-semibold tracking-widest uppercase text-neutral-400 group-hover:text-neutral-700">
                  {prevOutfit.lookNumber}
                </span>
              </button>

              {/* Left Navigation Arrow */}
              <button
                type="button"
                onClick={handlePrev}
                disabled={isTransitioning}
                aria-label="Previous Look"
                className="absolute left-1 sm:left-[20%] top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-neutral-900 border border-neutral-200 hover:border-[#16382C] shadow-xs flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Center Active Full-Body Male Model + Numbered Pins */}
              <div className="relative w-[82%] sm:w-[54%] h-full flex items-center justify-center">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={baseActiveOutfit.id}
                    custom={direction}
                    initial={{ opacity: 0, x: direction > 0 ? 32 : -32, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: direction > 0 ? -32 : 32, scale: 0.98 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="relative h-full w-full flex items-center justify-center"
                  >
                    {/* Aspect-matched inner wrapper so percentage pin coordinates stay locked to the model */}
                    <div className="relative h-full max-w-full aspect-[2/3] py-2 flex items-center justify-center">
                      <img
                        src={baseActiveOutfit.modelImage}
                        alt={`${baseActiveOutfit.name} — Male Fashion Look ${baseActiveOutfit.lookNumber}`}
                        className="w-full h-full object-contain object-center"
                        loading="eager"
                        draggable={false}
                      />

                      {/* Numbered Circular Product Pins */}
                      {activeProducts.map((item) => {
                        const isSelected = selectedPinId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handlePinSelect(item)}
                            aria-label={`Pin ${item.pinNumber}: ${item.name}`}
                            style={{
                              top: `${item.top}%`,
                              left: `${item.left}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                            className={`absolute z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-full text-[11px] sm:text-xs font-bold flex items-center justify-center transition-all duration-200 cursor-pointer ${
                              isSelected
                                ? 'bg-[#16382C] text-white border-2 border-white ring-4 ring-[#16382C]/25 scale-115 shadow-md'
                                : 'bg-white/95 text-neutral-900 border border-neutral-300 hover:border-[#16382C] hover:scale-110 shadow-sm'
                            }`}
                          >
                            {item.pinNumber}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Right Navigation Arrow */}
              <button
                type="button"
                onClick={handleNext}
                disabled={isTransitioning}
                aria-label="Next Look"
                className="absolute right-1 sm:right-[20%] top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-neutral-900 border border-neutral-200 hover:border-[#16382C] shadow-xs flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Next Model Preview (Desktop & Tablet) */}
              <button
                type="button"
                onClick={handleNext}
                disabled={isTransitioning}
                aria-label={`Next look: ${nextOutfit.name}`}
                className="hidden sm:flex flex-col items-center justify-center w-[22%] h-[68%] opacity-50 hover:opacity-85 transition-all duration-300 cursor-pointer group focus:outline-none"
              >
                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                  <img
                    src={nextOutfit.modelImage}
                    alt={nextOutfit.name}
                    className="w-full h-full object-contain object-center transition-transform duration-300 group-hover:scale-105"
                    draggable={false}
                  />
                </div>
                <span className="mt-1.5 text-[10px] font-semibold tracking-widest uppercase text-neutral-400 group-hover:text-neutral-700">
                  {nextOutfit.lookNumber}
                </span>
              </button>
            </div>

            {/* Active Pin Quick Bar + Look Dots */}
            <div className="w-full max-w-md mt-3 flex flex-col items-center gap-2.5">
              {activePinnedItem && (
                <div className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 bg-neutral-50/70 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-[#16382C] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {activePinnedItem.pinNumber}
                    </span>
                    <span className="font-medium text-neutral-900 truncate">
                      {activePinnedItem.name}
                    </span>
                  </div>
                  <span className="font-bold text-[#16382C] flex-shrink-0">
                    ₹{activePinnedItem.price.toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {/* Look Indicator Dots */}
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Select Outfit Look">
                {OUTFITS.map((look, idx) => {
                  const isActive = idx === currentIndex;
                  return (
                    <button
                      key={look.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Look ${look.lookNumber}: ${look.name}`}
                      onClick={() => switchLook(idx, idx > currentIndex ? 1 : -1)}
                      className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                        isActive ? 'w-6 bg-[#16382C]' : 'w-1.5 bg-neutral-300 hover:bg-neutral-400'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* =====================================================================
              RIGHT SECTION: ONE BIG LOOK TITLE + INTERACTIVE PRODUCT LIST + ADD FULL LOOK
              ===================================================================== */}
          <div className="lg:col-span-5 flex flex-col">
            {/* Big Outfit Title */}
            <div className="pb-4 border-b border-neutral-200">
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-neutral-950 tracking-tight leading-tight">
                {baseActiveOutfit.name}
              </h2>
            </div>

            {/* Interactive Product List */}
            <div className="divide-y divide-neutral-200">
              {activeProducts.map((item) => {
                const isSelected = selectedPinId === item.id;
                const chosenSize = getSelectedSize(item);
                const isAdding = addingItemId === item.id;
                const isAdded = !!addedItemIds[item.id];
                const canPurchase = item.inStock && item.existsInDb;

                return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      rowRefs.current[item.id] = el;
                    }}
                    onClick={() => setSelectedPinId(item.id)}
                    className={`py-3.5 px-2.5 -mx-2.5 rounded-lg transition-colors duration-200 flex items-center gap-3 cursor-pointer ${
                      isSelected ? 'bg-[#16382C]/[0.04]' : 'hover:bg-neutral-50'
                    }`}
                  >
                    {/* Pin Number Badge */}
                    <span
                      className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[#16382C] text-white'
                          : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                      }`}
                    >
                      {item.pinNumber}
                    </span>

                    {/* Product Thumbnail */}
                    <Link
                      to={`/products/${item.slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-14 h-16 rounded-md bg-neutral-50 border border-neutral-200/80 flex items-center justify-center p-1 flex-shrink-0 overflow-hidden"
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </Link>

                    {/* Product Details & Size Selector */}
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/products/${item.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs sm:text-sm font-semibold text-neutral-900 hover:text-[#16382C] line-clamp-1 transition-colors block"
                      >
                        {item.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-500">
                        <span className="truncate">{item.color}</span>
                        {!canPurchase && (
                          <span className="inline-flex items-center gap-0.5 text-red-600 font-semibold flex-shrink-0">
                            <AlertCircle className="w-3 h-3" />
                            {!item.existsInDb ? 'Unavailable' : 'Out of stock'}
                          </span>
                        )}
                      </div>

                      {/* Compact Size Selector + Price */}
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-neutral-950">
                          ₹{item.price.toLocaleString('en-IN')}
                        </span>
                        {item.sizes && item.sizes.length > 1 ? (
                          <select
                            aria-label={`Select size for ${item.name}`}
                            value={chosenSize}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleSizeChange(item.id, e.target.value)}
                            disabled={!canPurchase}
                            className="text-[11px] font-semibold text-neutral-700 bg-white border border-neutral-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-[#16382C] cursor-pointer disabled:opacity-50"
                          >
                            {item.sizes.map((sz) => (
                              <option key={sz} value={sz}>
                                {sz}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] font-medium text-neutral-500 border border-neutral-200 rounded px-1.5 py-0.5">
                            {chosenSize}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Individual Add to Cart Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddSingleItem(item);
                      }}
                      disabled={!canPurchase || isAdding}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 flex-shrink-0 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        isAdded
                          ? 'bg-[#16382C] text-white'
                          : 'border border-neutral-300 hover:border-[#16382C] text-neutral-900 hover:text-[#16382C] bg-white'
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Added</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isAdding ? '...' : 'Add'}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add Full Look Footer */}
            <div className="pt-4 mt-2 border-t border-neutral-200 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500 font-medium">
                  Full Look ({availableProducts.length} available{' '}
                  {availableProducts.length === 1 ? 'item' : 'items'})
                </span>
                <span className="text-lg font-bold text-neutral-950">
                  ₹{fullLookPrice.toLocaleString('en-IN')}
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddFullLook}
                disabled={isAddingFullLook || availableProducts.length === 0}
                className="w-full py-3.5 px-5 rounded-lg bg-[#16382C] hover:bg-[#102920] text-white text-xs font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fullLookAdded ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Full Look Added to Bag</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>
                      {isAddingFullLook ? 'Adding Full Look...' : 'Add Full Look to Bag'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
