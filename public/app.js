
const modal = document.getElementById("bookingModal");
const form = document.getElementById("bookingForm");
const statusBox = document.getElementById("bookingStatus");

document.querySelectorAll("[data-open-booking]").forEach(button => {
  button.addEventListener("click", () => {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  });
});

document.querySelectorAll("[data-close-booking]").forEach(button => {
  button.addEventListener("click", () => {
    modal.hidden = true;
    document.body.style.overflow = "";
  });
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  statusBox.style.color = "";
  statusBox.textContent = "Enviando...";

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo enviar la solicitud.");

    form.reset();
    statusBox.style.color = "#96efb0";
    statusBox.textContent = "Solicitud enviada. Alex confirmará el horario.";
  } catch (error) {
    statusBox.style.color = "#ffb4b4";
    statusBox.textContent = error.message;
  }
});
