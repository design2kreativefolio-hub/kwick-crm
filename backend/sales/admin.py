from django.contrib import admin

from .models import Client, Invoice, InvoiceLineItem, Proposal


class LineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ["invoice_number", "client", "amount", "status", "due_date"]
    list_filter = ["status"]
    inlines = [LineItemInline]


admin.site.register(Client)
admin.site.register(Proposal)
