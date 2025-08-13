import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {getAuth, onAuthStateChanged, signOut} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import{getFirestore, getDoc, doc} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js"

const firebaseConfig = {
  apiKey: "AIzaSyC-Yu2UgqF5BVuNFSej_-dm0tVeZi9r37U",
  authDomain: "login-6978f.firebaseapp.com",
  projectId: "login-6978f",
  storageBucket: "login-6978f.firebasestorage.app",
  messagingSenderId: "359944908271",
  appId: "1:359944908271:web:514897139121b86ebada1a",
  measurementId: "G-WSTBP08YH2"
};
 // Initialize Firebase
  const app = initializeApp(firebaseConfig);

  const auth=getAuth();
  const db=getFirestore();

  onAuthStateChanged(auth, (user)=>{
    const loggedInUserId=localStorage.getItem('loggedInUserId');
    if(loggedInUserId){
        console.log(user);
        const docRef = doc(db, "users", loggedInUserId);
        getDoc(docRef)
        .then((docSnap)=>{
            if(docSnap.exists()){
                const userData=docSnap.data();
                document.getElementById('loggedUserFName').innerText=userData.firstName;
                // ฟังก์ชันซ่อนอีเมล
                function maskEmail(email) {
                  const [localPart, domain] = email.split("@");
                  const visiblePart = localPart.slice(0, 3); // เอาแค่ 3 ตัวแรก
                  return visiblePart + "******@" + domain;
                }
                document.getElementById('loggedUserEmail').innerText = maskEmail(userData.email);
                document.getElementById('loggedUserLName').innerText=userData.lastName
            }
            else{
                console.log("no document found matching id")
            }
        })
        .catch((error)=>{
            console.log("Error getting document");
        })
    }
    else{
        console.log("User Id not Found in Local storage")
    }
  })

  const logoutButton=document.getElementById('logout');

  logoutButton.addEventListener('click',()=>{
    localStorage.removeItem('loggedInUserId');
    signOut(auth)
    .then(()=>{
        window.location.href='/login/Login.html';
    })
    .catch((error)=>{
        console.error('Error Signing out:', error);
    })
  })