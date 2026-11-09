import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { AuthResult } from "./auth-client";
import { decodeAssetResponse } from "./assets-response";
import { isAdminOrderDetail, isAdminOrderPage, isAuditPage, isIncidentPage, isOperationsDashboard, isOperationsMetrics } from "./operations-validation";
import { isOfferPage } from "./offers-validation";
import { isOfferView } from "./offers-admin-validation";
import { checkedOffer } from "./offers-admin-client";
import { checkSupportTicket, supportQuery, type SupportQuery } from "./support-client";
import { isSupportTicketPage, isSupportTicketView } from "./support-validation";
import { contentCaseEtag, isContentCase, isContentCasePage } from "./support-work-validation";
import { matchingResource as matching, resourceId as id } from "./resource-http";
import { operationsQueryString, type AdminOfferQuery, type AdminOrderQuery, type AuditQuery, type ContentCaseQuery, type IncidentQuery, type MetricsQuery, type OperationsPeriodQuery } from "../operations/query";
async function read<T>(path:string,guard:(value:unknown)=>value is T):Promise<AuthResult<T>>{
  const session=(await cookies()).get("SESSION")?.value;if(!session||!/^[A-Za-z0-9+/=_-]+$/.test(session))return {ok:false,error:{kind:"http",status:401}};
  try{const config=getServerConfig();return await decodeAssetResponse(await fetch(new URL(`/api/v1${path}`,config.apiInternalOrigin),{headers:{Accept:"application/json, application/problem+json",Cookie:`SESSION=${session}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(config.apiTimeoutMs)}),guard);}catch{return {ok:false,error:{kind:"unavailable"}};}
}
export const readOperationsDashboard=(query:OperationsPeriodQuery)=>read(`/admin/operations/dashboard?${operationsQueryString("dashboard",query)}`,matching(isOperationsDashboard,v=>Date.parse(v.period.from)===Date.parse(query.from)&&Date.parse(v.period.to)===Date.parse(query.to)));
export const readAdminOrders=(query:AdminOrderQuery)=>read(`/admin/orders?${operationsQueryString("orders",query)}`,matching(isAdminOrderPage,v=>v.page===(query.page??0)&&v.pageSize===(query.pageSize??20)));
export const readAdminOrder=(orderId:string)=>read(`/admin/orders/${id(orderId)}`,matching(isAdminOrderDetail,v=>v.order.id===orderId));
export const readAdminOffers=(query:AdminOfferQuery)=>read(`/admin/offers?${operationsQueryString("offers",query)}`,matching(isOfferPage,v=>v.page===(query.page??0)&&v.pageSize===(query.pageSize??20)&&v.items.every(item=>item.locale===query.locale)));
export const readAdminOffer=(offerId:string)=>checkedOffer(read(`/admin/offers/${id(offerId)}`,matching(isOfferView,v=>v.id===offerId)));
export const readAdminSupportTickets=(query:SupportQuery={})=>read(`/admin/support-tickets?${supportQuery(query)}`,matching(isSupportTicketPage,v=>v.page===(query.page??0)&&v.pageSize===(query.pageSize??20)));
export const readAdminSupportTicket=(ticketId:string)=>checkSupportTicket(read(`/admin/support-tickets/${id(ticketId)}`,matching(isSupportTicketView,v=>v.id===ticketId)));
export const readContentCases=(query:ContentCaseQuery)=>read(`/admin/content-cases?${operationsQueryString("content-cases",query)}`,matching(isContentCasePage,v=>v.page===(query.page??0)&&v.pageSize===(query.pageSize??20)));
export async function readContentCase(caseId:string){const value=await read(`/admin/content-cases/${id(caseId)}`,matching(isContentCase,v=>v.id===caseId));return value.ok&&value.etag!==contentCaseEtag(value.data)?{ok:false as const,error:{kind:"invalid-response" as const,status:value.status}}:value;}
export const readOperationsMetrics=(query:MetricsQuery)=>read(`/admin/metrics?${operationsQueryString("metrics",query)}`,matching(isOperationsMetrics,v=>Date.parse(v.period.from)===Date.parse(query.from)&&Date.parse(v.period.to)===Date.parse(query.to)));
export const readOperationsAudit=(query:AuditQuery)=>read(`/admin/audit?${operationsQueryString("audit",query)}`,matching(isAuditPage,v=>v.page===(query.page??0)&&v.pageSize===(query.pageSize??20)));
export const readOperationsIncidents=(query:IncidentQuery)=>read(`/admin/incidents?${operationsQueryString("incidents",query)}`,matching(isIncidentPage,v=>v.page===(query.page??0)&&v.pageSize===(query.pageSize??20)));
