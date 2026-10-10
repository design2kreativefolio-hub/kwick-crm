"""Sanitiser for user-authored rich text that is rendered unescaped into PDFs."""
from django import template
from django.utils.safestring import mark_safe

import nh3

register = template.Library()

_TAGS = {
    "p", "br", "hr", "div", "span", "strong", "b", "em", "i", "u", "s", "sub", "sup",
    "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col", "a", "img",
}
_ATTRS = {
    "*": {"style", "class", "align"},
    "a": {"href", "title"},
    "img": {"src", "alt", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}


@register.filter(name="clean_html")
def clean_html(value):
    """Strip scripts, event handlers, <link>/<style>/<iframe> and non-web URL schemes."""
    if not value:
        return ""
    cleaned = nh3.clean(
        str(value),
        tags=_TAGS,
        attributes=_ATTRS,
        url_schemes={"http", "https", "mailto", "data"},
        link_rel=None,
    )
    return mark_safe(cleaned)
