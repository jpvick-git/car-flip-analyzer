const US_STATES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia",
  "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt",
  "va", "wa", "wv", "wi", "wy", "dc",
]);

const MULTI_WORD_MAKES = [
  ["mercedes", "benz"],
  ["land", "rover"],
  ["alfa", "romeo"],
  ["aston", "martin"],
  ["rolls", "royce"],
];

const COPART_MAKE_CODES = {
  MERZ: "Mercedes-Benz",
  HYUN: "Hyundai",
  NISS: "Nissan",
  ACUR: "Acura",
  CHRY: "Chrysler",
  CHEV: "Chevrolet",
  TOYT: "Toyota",
  VOLK: "Volkswagen",
  PORS: "Porsche",
  INFI: "Infiniti",
  CADI: "Cadillac",
  MAZD: "Mazda",
  SUBA: "Subaru",
  MITS: "Mitsubishi",
  LINC: "Lincoln",
  BUIC: "Buick",
  DODG: "Dodge",
  FRD: "Ford",
  FORD: "Ford",
  GMC: "GMC",
  JEEP: "Jeep",
  RAM: "Ram",
  BMW: "BMW",
  AUDI: "Audi",
  LEXU: "Lexus",
  VOLV: "Volvo",
  MINI: "MINI",
  JAGU: "Jaguar",
  GENE: "Genesis",
  KIA: "Kia",
  TESL: "Tesla",
};

const UPPERCASE_MAKES = new Set(["bmw", "gmc", "ram", "kia", "mini"]);
const UPPERCASE_MODEL_TOKENS = new Set([
  "4matic", "4ma", "4x4", "awd", "fwd", "rwd", "sdrive", "xdrive", "4wd", "2wd",
  "tlx", "tsx", "mdx", "rdx", "glc", "gle", "gls", "glk", "clk",
]);

function formatMakeToken(token) {
  if (UPPERCASE_MAKES.has(token)) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function formatMake(tokens) {
  const key = tokens.join("-");
  if (key === "mercedes-benz") return "Mercedes-Benz";
  if (key === "land-rover") return "Land Rover";
  if (key === "alfa-romeo") return "Alfa Romeo";
  if (key === "aston-martin") return "Aston Martin";
  if (key === "rolls-royce") return "Rolls-Royce";
  if (tokens.length === 1) return formatMakeToken(tokens[0]);
  return tokens.map(formatMakeToken).join(" ");
}

function formatModelToken(token) {
  const lower = token.toLowerCase();
  if (UPPERCASE_MODEL_TOKENS.has(lower)) return lower.toUpperCase();
  if (/^\d+$/.test(token)) return token;
  if (/^[a-z]\d+[a-z0-9]*$/i.test(token)) return token.toUpperCase();
  if (/^\d+[a-z]+$/i.test(token)) return token.toUpperCase();
  if (token.length <= 2 && /^[a-z]+$/i.test(token)) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function vehicleTokensBeforeLocation(partsAfterYear) {
  if (!partsAfterYear.length) return [];
  for (let i = 0; i < partsAfterYear.length - 1; i += 1) {
    if (US_STATES.has(partsAfterYear[i].toLowerCase())) {
      return partsAfterYear.slice(0, i);
    }
  }
  if (partsAfterYear.length >= 2) return partsAfterYear.slice(0, -2);
  return partsAfterYear;
}

function parseMakeModelFromLotUrl(lotUrl, year) {
  if (!lotUrl) return { make: null, model: null };
  const match = lotUrl.trim().match(/\/lot\/\d+\/(.+?)\/?$/i);
  if (!match) return { make: null, model: null };

  const parts = match[1].toLowerCase().split("-");
  const yearStr = year != null ? String(year).trim() : null;

  let yearIdx = null;
  for (let i = 0; i < parts.length; i += 1) {
    if (/^\d{4}$/.test(parts[i])) {
      if (!yearStr || parts[i] === yearStr) {
        yearIdx = i;
        break;
      }
      if (yearIdx === null) yearIdx = i;
    }
  }
  if (yearIdx === null) return { make: null, model: null };

  const vehicleParts = vehicleTokensBeforeLocation(parts.slice(yearIdx + 1));
  if (!vehicleParts.length) return { make: null, model: null };

  for (const makeTokens of MULTI_WORD_MAKES) {
    if (vehicleParts.slice(0, makeTokens.length).join("-") === makeTokens.join("-")) {
      return {
        make: formatMake(makeTokens),
        model: vehicleParts.slice(makeTokens.length).map(formatModelToken).join(" "),
      };
    }
  }

  return {
    make: formatMake([vehicleParts[0]]),
    model: vehicleParts.slice(1).map(formatModelToken).join(" "),
  };
}

export function resolveVehicleName(car) {
  if (!car) return { year: "", make: "", model: "" };

  const { make: urlMake, model: urlModel } = parseMakeModelFromLotUrl(
    car.lot_url,
    car.year
  );

  let make = urlMake;
  if (!make && car.make) {
    const code = String(car.make).trim().toUpperCase();
    make = COPART_MAKE_CODES[code] || String(car.make).trim();
  }

  let model = urlModel || (car.model ? String(car.model).trim() : "");

  return {
    year: car.year ?? "",
    make: make ?? "",
    model: model ?? "",
  };
}

export function formatVehicleTitle(car) {
  const { year, make, model } = resolveVehicleName(car);
  return [year, make, model].filter(Boolean).join(" ").trim();
}
