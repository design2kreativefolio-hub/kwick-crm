from decimal import Decimal

from django.db import models

from common.models import TimeStampedModel

MONEY = dict(max_digits=12, decimal_places=2, default=Decimal("0.00"))


class Client(TimeStampedModel):
    name = models.CharField(max_length=200)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    company = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Proposal(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="proposals")
    title = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    amount = models.DecimalField(**MONEY)
    valid_until = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.status})"


class Invoice(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="invoices")
    proposal = models.ForeignKey(
        Proposal, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices"
    )
    invoice_number = models.CharField(max_length=50, unique=True)
    amount = models.DecimalField(**MONEY)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    due_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return self.invoice_number


class InvoiceLineItem(TimeStampedModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    description = models.CharField(max_length=300)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    unit_price = models.DecimalField(**MONEY)

    @property
    def line_total(self) -> Decimal:
        return self.quantity * self.unit_price
