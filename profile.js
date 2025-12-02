/* Firebase Init */
const firebaseConfig = {
    apiKey: "AIzaSyAXu1FJ0VhjM0XxYIfs7KLDx1Chh1tDBfw",
    authDomain: "expense-tracker-akif-832fb.firebaseapp.com",
    projectId: "expense-tracker-akif-832fb",
    storageBucket: "expense-tracker-akif-832fb.appspot.com",
    messagingSenderId: "846826483222",
    appId: "1:846826483222:web:2fcc5d66100a14c6fc0f37"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

/* Toast */
function toast(msg, err = false) {
    const box = document.getElementById("toastBox");
    const el = document.createElement("div");
    el.className = "toast" + (err ? " error" : "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

/* Password toggle */
function togglePass(id) {
    const x = document.getElementById(id);
    x.type = x.type === "password" ? "text" : "password";
}

/* Load profile data */
auth.onAuthStateChanged(async user => {
    if (!user) return location.href = "index.html";

    profileEmail.value = user.email;

    const snap = await db.collection("users").doc(user.uid).get();
    if (snap.exists) {
        const d = snap.data();
        profileName.value = d.name || "";
        profilePhone.value = d.phone || "";
        profileGender.value = d.gender || "";
        profileDob.value = d.dob || "";
        profileBio.value = d.bio || "";
        if (d.photo) profilePic.src = d.photo;
    }
});

/* Save profile */
saveProfileBtn.onclick = async() => {
    const user = auth.currentUser;
    if (!user) return;

    await db.collection("users").doc(user.uid).set({
        name: profileName.value,
        phone: profilePhone.value,
        gender: profileGender.value,
        dob: profileDob.value,
        bio: profileBio.value
    }, { merge: true });

    toast("Profile updated!");
};

/* Password update */
changePassBtn.onclick = async() => {
    const user = auth.currentUser;

    const oldP = oldPass.value.trim();
    const newP = newPass.value.trim();
    const conP = confirmPass.value.trim();

    if (!oldP || !newP || !conP) return toast("Fill all fields", true);
    if (newP !== conP) return toast("Passwords do not match", true);

    try {
        const cred = firebase.auth.EmailAuthProvider.credential(user.email, oldP);
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(newP);

        oldPass.value = newPass.value = confirmPass.value = "";
        toast("Password changed!");
    } catch (e) { toast(e.message, true); }
};

/* Cropper */
let cropper;

changePicBtn.onclick = () => picInput.click();

picInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    cropImage.src = URL.createObjectURL(file);
    cropModal.classList.add("show");

    cropImage.onload = () => {
        cropper = new Cropper(cropImage, {
            aspectRatio: 1,
            viewMode: 1
        });
    };
};

cropClose.onclick = () => {
    cropModal.classList.remove("show");
    cropper.destroy();
};

cropUpload.onclick = async() => {
    const user = auth.currentUser;
    if (!user || !cropper) return;

    const canvas = cropper.getCroppedCanvas({ width: 600, height: 600 });

    canvas.toBlob(async blob => {
        const ref = storage.ref(`profilePics/${user.uid}.jpg`);
        await ref.put(blob);

        const url = await ref.getDownloadURL();

        await user.updateProfile({ photoURL: url });
        await db.collection("users").doc(user.uid).set({ photo: url }, { merge: true });

        profilePic.src = url;
        toast("Photo updated!");

        cropModal.classList.remove("show");
        cropper.destroy();
    });
};

removePicBtn.onclick = async() => {
    const user = auth.currentUser;
    if (!user) return;

    await storage.ref(`profilePics/${user.uid}.jpg`).delete().catch(() => {});
    await user.updateProfile({ photoURL: null });
    await db.collection("users").doc(user.uid).set({ photo: null }, { merge: true });

    profilePic.src = "https://i.imgur.com/4ZQZ4ZC.png";
    toast("Picture removed");
};