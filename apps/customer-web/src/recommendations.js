// Curated recommendation bundles & intelligent cross-sells for Sprint by abh1

export const STORE_PRESETS = [
  {
    id: "preset-college-thesis",
    title: "College Project / Thesis Pack",
    category: "Academic",
    badge: "Most Popular for Students",
    tagline: "High-yield B&W prints with durable spiral binding and clear protective cover.",
    itemsIncluded: [
      { type: "PRINT", label: "Double-sided B&W print (60-80 pages typical)" },
      { type: "SERVICE", label: "Heavy Duty Spiral Binding + Poly cover" },
      { type: "STATIONERY", label: "Classmate Sticky Notes for viva markers" }
    ],
    recommendedServiceId: "srv-bind",
    recommendedProductId: "prod-nb-01",
    sampleSavings: "Save 15% bundled"
  },
  {
    id: "preset-govt-id",
    title: "Govt ID & Visa Application Kit",
    category: "Official",
    badge: "Official & Legal",
    tagline: "Ultra-sharp A4 color printouts, archival thermal lamination & adhesive kit.",
    itemsIncluded: [
      { type: "PRINT", label: "A4 High-Res Full Color Print (Single-sided)" },
      { type: "SERVICE", label: "100-Micron Waterproof Lamination" },
      { type: "STATIONERY", label: "Fevicol Glue stick for document photos" }
    ],
    recommendedServiceId: "srv-lam",
    recommendedProductId: "prod-adh-01",
    sampleSavings: "Ready in 3 minutes"
  },
  {
    id: "preset-resume-pack",
    title: "Executive Interview & Resume Pack",
    category: "Career",
    badge: "Top Pick",
    tagline: "Crisp 100gsm resume sheets, transparent document folder, and signature pen.",
    itemsIncluded: [
      { type: "PRINT", label: "Crisp Black & White Resumes (5 Copies)" },
      { type: "STATIONERY", label: "Reynolds 045 Fine Ballpoint Pen" },
      { type: "STATIONERY", label: "Clear Document Button Folder" }
    ],
    recommendedProductId: "prod-pen-01",
    sampleSavings: "Counter Handover"
  },
  {
    id: "preset-exam-kit",
    title: "Semester Exam Prep & Hall Ticket",
    category: "Student",
    badge: "Fast Counter Pickup",
    tagline: "Admit card color print, waterproof pouch, highlighters and ballpoint pens.",
    itemsIncluded: [
      { type: "PRINT", label: "Hall Ticket Color Print" },
      { type: "STATIONERY", label: "Camlin Fluorescent Highlighter Set" },
      { type: "STATIONERY", label: "Reynolds 045 Fine Blue Pen (Pack of 2)" }
    ],
    recommendedProductId: "prod-hl-01",
    sampleSavings: "Zero Counter Wait"
  }
];

export const SMART_CROSS_SELLS = [
  {
    id: "cross-bind",
    trigger: "PRINT",
    title: "Add Spiral Binding",
    subtitle: "Turn loose sheets into an organized booklet",
    badge: "Recommended",
    serviceId: "srv-bind",
    priceMinor: 4000,
    icon: "BookOpen"
  },
  {
    id: "cross-lam",
    trigger: "PRINT",
    title: "Add 100-Micron Lamination",
    subtitle: "Protect certificates and IDs from spills and folds",
    badge: "Popular",
    serviceId: "srv-lam",
    priceMinor: 2500,
    icon: "ShieldCheck"
  },
  {
    id: "cross-pen",
    trigger: "ANY",
    title: "Reynolds 045 Fine Ballpoint Pen",
    subtitle: "Need to sign documents right at the counter?",
    badge: "₹10 Add-on",
    productId: "prod-pen-01",
    priceMinor: 1000,
    icon: "PenTool"
  },
  {
    id: "cross-glue",
    trigger: "ANY",
    title: "Fevicol MR Adhesive (50g)",
    subtitle: "Affix passport photos on application forms",
    badge: "₹25 Add-on",
    productId: "prod-adh-01",
    priceMinor: 2500,
    icon: "Paperclip"
  }
];
