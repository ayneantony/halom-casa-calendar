import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  serverTimestamp, 
  runTransaction 
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// Firebase App Config
const firebaseConfig = {
  apiKey: "AIzaSyCLeIhKV7wHeeTtJhKuCSJuoJwfr8Lqn54",
  authDomain: "halom-casa-booking-calendar.firebaseapp.com",
  projectId: "halom-casa-booking-calendar",
  storageBucket: "halom-casa-booking-calendar.firebasestorage.app",
  messagingSenderId: "171254486073",
  appId: "1:171254486073:web:d1ea9a603c5b33d602a9e8"
};

const ADMIN_EMAIL = "ayneantony4159@gmail.com";
const propertyNames = {
  vagamon: "Halom Casa - Vagamon",
  mulavukad: "Halom Casa - Mulavukad"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const themeSelector = document.getElementById("themeSelector");
const loginBox = document.getElementById("loginBox");
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const logoutBtn = document.getElementById("logoutBtn");
const propLogoutBtn = document.getElementById("propLogoutBtn");
const copyReportBtn = document.getElementById("copyReportBtn");
const propertySelectBox = document.getElementById("propertySelectBox");
const calendarContainer = document.getElementById("calendarContainer");
const headerProperty = document.getElementById("headerProperty");
const guestNameInput = document.getElementById("guestName");
const bookingTypeSelect = document.getElementById("bookingType");
const saveBookingBtn = document.getElementById("saveBooking");
const unblockBtn = document.getElementById("unblockBtn");

const vDate = document.getElementById("vDate");
const vGuest = document.getElementById("vGuest");
const vType = document.getElementById("vType");
const vBookedBy = document.getElementById("vBookedBy");
const vBookedOn = document.getElementById("vBookedOn");
const vAvailability = document.getElementById("vAvailability");

let calendar = null;
let selectedDate = null;
let selectedDoc = null;
let selectedProperty = null;
let unsubscribeSnapshot = null;

// Theme Handling
const applyTheme = (theme) => {
    document.body.className = theme === 'light' ? 'light-theme' : '';
    themeSelector.value = theme;
    localStorage.setItem('halom_apex_theme', theme);
};
const savedTheme = localStorage.getItem('halom_apex_theme') || 'dark';
applyTheme(savedTheme);
themeSelector.onchange = (e) => applyTheme(e.target.value);

// Helper Utilities
function getUserColor(email) {
  if (email === ADMIN_EMAIL) return "#2563eb";
  const colors = ["#ff2a4b", "#059669", "#7c3aed", "#d97706", "#0284c7"];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash += email.charCodeAt(i);
  }
  return colors[Math.abs(hash) % colors.length];
}

function roomsUsed(type) {
  if (type === "Full Property") return 3;
  if (type === "2 Rooms") return 2;
  return 1;
}

function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }

document.getElementById("cancelBooking").onclick = () => closeModal("bookingModal");
document.getElementById("closeViewBtn").onclick = () => closeModal("viewModal");

// Security Input Sanitization
function sanitizeText(str) {
  return str.replace(/[&<>"'/]/g, (s) => {
    const entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;'
    };
    return entityMap[s];
  });
}

// Authentication Logic
loginForm.onsubmit = async (e) => {
    e.preventDefault();
    loginMsg.textContent = "";
    loginBtn.disabled = true;

    try {
        let clearEmail = emailInput.value.trim().toLowerCase();
        let clearPassword = passwordInput.value;
        
        // Clean up common copy-paste typography artifacts
        clearPassword = clearPassword.replace(/[\u2013\u2014]/g, "-")
                                     .replace(/[\u201C\u201D]/g, '"')
                                     .replace(/[\u2018\u2019]/g, "'")
                                     .replace(/\u00A0/g, ' ');

        if (!clearEmail || !clearPassword) {
            loginMsg.textContent = "Please fill in all fields.";
            return;
        }

        await signInWithEmailAndPassword(auth, clearEmail, clearPassword);
        loginForm.reset();
    } catch (error) {
        switch (error.code) {
            case "auth/invalid-credential":
            case "auth/invalid-email":
            case "auth/user-not-found":
            case "auth/wrong-password":
                loginMsg.textContent = "Invalid email or password.";
                break;
            case "auth/too-many-requests":
                loginMsg.textContent = "Account temporarily locked due to failed attempts. Try again later.";
                break;
            default:
                loginMsg.textContent = "Authentication failed. Please try again.";
        }
    } finally {
        loginBtn.disabled = false;
    }
};

const performLogout = async () => {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }
    selectedProperty = null;
    await signOut(auth);
};

logoutBtn.onclick = performLogout;
propLogoutBtn.onclick = performLogout;

onAuthStateChanged(auth, user => {
 if (user) {
  loginBox.style.display = "none";
  logoutBtn.style.display = "inline-flex";
  if (selectedProperty) {
      showCalendarView();
  } else {
      showPropertySelectionView();
  }
 } else {
  loginBox.style.display = "block";
  propertySelectBox.style.display = "none";
  calendarContainer.style.display = "none";
  logoutBtn.style.display = "none";
  copyReportBtn.style.display = "none";
  headerProperty.style.display = "none";
 }
});

// View Navigation
function showPropertySelectionView() {
    propertySelectBox.style.display = "block";
    calendarContainer.style.display = "none";
    copyReportBtn.style.display = "none";
    headerProperty.style.display = "none";
}

function showCalendarView() {
    propertySelectBox.style.display = "none";
    calendarContainer.style.display = "block";
    copyReportBtn.style.display = "inline-flex";
    
    headerProperty.innerText = propertyNames[selectedProperty];
    headerProperty.style.display = "inline-block";

    if (!calendar) {
        initCalendar();
    } else {
        calendar.render();
        loadBookings();
    }
}

document.getElementById("selectVagamonBtn").onclick = () => {
    selectedProperty = "vagamon";
    showCalendarView();
};

document.getElementById("selectMulavukadBtn").onclick = () => {
    selectedProperty = "mulavukad";
    showCalendarView();
};

document.getElementById("backToPropsBtn").onclick = () => {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }
    selectedProperty = null;
    showPropertySelectionView();
};

// Calendar Initialization & Snapshot Synchronizer
function initCalendar() {
 const isMobile = window.innerWidth <= 600;

 calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
  initialView: isMobile ? 'listMonth' : 'dayGridMonth',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,listMonth'
  },
  buttonText: {
    dayGridMonth: 'Grid',
    listMonth: 'List'
  },
  height: 'auto',
  handleWindowResize: true,
  dateClick(info) {
   if (!auth.currentUser) return;
   selectedDate = info.dateStr;
   openModal("bookingModal");
  },
  eventClick(info) {
   const e = info.event.extendedProps;
   selectedDoc = e.docId;
   vDate.innerText = sanitizeText(info.event.startStr);
   vGuest.innerText = sanitizeText(e.guestName);
   vType.innerText = sanitizeText(e.bookingType);
   vBookedBy.innerText = sanitizeText(e.bookedBy || "-");
   vBookedOn.innerText = e.createdAt && e.createdAt.toDate ? e.createdAt.toDate().toLocaleString() : "-";
   vAvailability.innerText = sanitizeText(e.availability || "");
   
   const user = auth.currentUser;
   unblockBtn.style.display = (user.email === ADMIN_EMAIL || user.uid === e.userId) ? "inline-flex" : "none";
   openModal("viewModal");
  }
 });
 calendar.render();
 loadBookings();
}

function loadBookings() {
 if (unsubscribeSnapshot) {
     unsubscribeSnapshot();
 }
 if (!selectedProperty) return;

 unsubscribeSnapshot = onSnapshot(query(collection(db, "blockedDates")), (snap) => {
  calendar.removeAllEvents();
  const dayTotals = {};

  snap.forEach(d => {
   const data = d.data();
   const docProperty = data.property || "vagamon"; 
   if (docProperty === selectedProperty) {
       const used = roomsUsed(data.bookingType || "1 Room");
       dayTotals[data.date] = (dayTotals[data.date] || 0) + used;
   }
  });

  snap.forEach(d => {
   const data = d.data();
   const docProperty = data.property || "vagamon";
   if (docProperty === selectedProperty) {
       const remaining = Math.max(0, 3 - (dayTotals[data.date] || 0));
       calendar.addEvent({
        title: `${String(data.bookingType)} - ${String(data.guestName)}`,
        start: data.date,
        allDay: true,
        backgroundColor: getUserColor(data.bookedBy || ""),
        textColor: "#ffffff",
        docId: d.id,
        guestName: data.guestName,
        bookingType: data.bookingType,
        bookedBy: data.bookedBy,
        userId: data.userId,
        createdAt: data.createdAt,
        availability: remaining === 0 ? "Fully Booked" : remaining + " room(s) available"
       });
   }
  });
 }, (error) => {
   console.error("Firestore Snapshot Error:", error);
 });
}

// Database Transaction Operations
saveBookingBtn.onclick = async () => {
    saveBookingBtn.disabled = true;
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Authentication required.");
        if (!selectedProperty) throw new Error("No property selected.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) throw new Error("Invalid date selection.");

        const guest = guestNameInput.value.trim();
        if (!/^[A-Za-z0-9 .'-]{2,50}$/.test(guest)) {
            throw new Error("Guest name must be 2-50 characters (letters, numbers, spaces, dashes).");
        }

        const type = bookingTypeSelect.value;
        const allowedTypes = ["Full Property", "1 Room", "2 Rooms"];
        if (!allowedTypes.includes(type)) {
            throw new Error("Invalid booking option selected.");
        }

        const requested = roomsUsed(type);
        const countDocKey = `${selectedProperty}_${selectedDate}`;
        const countDocRef = doc(db, "roomCounts", countDocKey);
        const newBookingRef = doc(collection(db, "blockedDates"));

        await runTransaction(db, async (transaction) => {
            const countSnap = await transaction.get(countDocRef);
            let currentUsed = 0;
            if (countSnap.exists()) {
                currentUsed = countSnap.data().totalRooms || 0;
            }

            if (currentUsed + requested > 3) {
                throw new Error("Date capacity exceeded. Not enough rooms available.");
            }

            transaction.set(countDocRef, { totalRooms: currentUsed + requested }, { merge: true });
            transaction.set(newBookingRef, {
                property: selectedProperty,
                date: selectedDate,
                guestName: guest,
                bookingType: type,
                bookedBy: user.email,
                userId: user.uid,
                createdAt: serverTimestamp()
            });
        });

        guestNameInput.value = "";
        closeModal("bookingModal");
    } catch (error) {
        alert(error.message || "Unable to complete booking request.");
    } finally {
        saveBookingBtn.disabled = false;
    }
};

unblockBtn.onclick = async () => {
    unblockBtn.disabled = true;
    try {
        const events = calendar.getEvents().filter(e => e.extendedProps.docId === selectedDoc);
        if (events.length === 0) return;
        
        const targetEvent = events[0];
        const targetDate = targetEvent.startStr;
        const targetType = targetEvent.extendedProps.bookingType;
        const roomsToFree = roomsUsed(targetType);

        const countDocKey = `${selectedProperty}_${targetDate}`;
        const countDocRef = doc(db, "roomCounts", countDocKey);
        const bookingDocRef = doc(db, "blockedDates", selectedDoc);

        await runTransaction(db, async (transaction) => {
            const countSnap = await transaction.get(countDocRef);
            let currentUsed = 0;
            if (countSnap.exists()) {
                currentUsed = countSnap.data().totalRooms || 0;
            }

            let newTotal = Math.max(0, currentUsed - roomsToFree);
            transaction.set(countDocRef, { totalRooms: newTotal }, { merge: true });
            transaction.delete(bookingDocRef);
        });

        closeModal("viewModal");
    } catch (error) {
        alert("Unable to cancel booking safely.");
    } finally {
        unblockBtn.disabled = false;
    }
};

copyReportBtn.onclick = async () => {
  try {
    if (!calendar || !selectedProperty) return;

    const currentViewDate = calendar.getDate(); 
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthName = monthNames[currentViewDate.getMonth()];
    const currentYear = currentViewDate.getFullYear();
    const targetMonthYearStr = `${currentMonthName} ${currentYear}`;
    const targetMonthStr = String(currentViewDate.getMonth() + 1).padStart(2, '0');

    const events = calendar.getEvents()
      .filter(e => {
        const [year, month] = e.startStr.split('-');
        return year === String(currentYear) && month === targetMonthStr;
      })
      .sort((a, b) => a.startStr.localeCompare(b.startStr));

    const bookingLines = events.map(e => {
      const [year, month, day] = e.startStr.split('-');
      const formattedDate = `${day}/${month}/${year}`;
      const type = e.extendedProps.bookingType || "1 Room";
      const guest = e.extendedProps.guestName || "Guest";
      return `${formattedDate} - ${type} - ${guest}`;
    });

    const now = new Date();
    const genDay = String(now.getDate()).padStart(2, '0');
    const genMonth = String(now.getMonth() + 1).padStart(2, '0');
    const genYear = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    const genTime = `${genDay}/${genMonth}/${genYear} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

    const reportText = [
      `Halom Casa Bookings (${propertyNames[selectedProperty]}) - ${targetMonthYearStr}\n`,
      bookingLines.join('\n'),
      `\nTotal Bookings: ${events.length}`,
      `\nGenerated on: ${genTime}`
    ].join('\n');

    await navigator.clipboard.writeText(reportText);
    const originalText = copyReportBtn.innerText;
    copyReportBtn.innerText = "Copied!";
    setTimeout(() => {
        copyReportBtn.innerText = originalText;
    }, 2000);
  } catch (err) {
    alert("Could not copy report to clipboard.");
  }
};
