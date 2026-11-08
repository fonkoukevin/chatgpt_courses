package com.chatgptcourses.payments.gateway;

import static com.chatgptcourses.payments.service.PaymentTypes.*;
import static com.chatgptcourses.payments.refunds.RefundTypes.*;
import com.chatgptcourses.commerce.service.PaymentGateway;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.payments.service.PaymentGatewayException;
import com.stripe.Stripe;
import com.stripe.StripeClient;
import com.stripe.exception.ApiConnectionException;
import com.stripe.exception.StripeException;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import com.stripe.param.checkout.SessionCreateParams;
import com.stripe.param.checkout.SessionLineItemListParams;
import com.stripe.param.checkout.SessionListParams;
import com.stripe.param.checkout.SessionRetrieveParams;
import com.stripe.param.RefundCreateParams;
import com.stripe.param.RefundListParams;
import com.stripe.param.PaymentIntentRetrieveParams;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/** Real pinned SDK against the configured API; no static global Stripe credentials or retry policy. */
public final class StripePaymentGateway implements PaymentGateway {
    private final StripeSettings settings;
    private final StripeClient client;
    private volatile boolean accountVerified;
    public StripePaymentGateway(StripeSettings settings){
        this.settings=settings;
        if(!StripeSettings.API_VERSION.equals(Stripe.API_VERSION))throw new IllegalStateException("Stripe API version mismatch");
        client=configured()?StripeClient.builder().setApiKey(settings.apiKey()).setApiBase(settings.apiBase().toString()).setConnectTimeout(Math.toIntExact(settings.connectTimeout().toMillis())).setReadTimeout(Math.toIntExact(settings.readTimeout().toMillis())).setMaxNetworkRetries(0).build():null;
    }
    @Override public boolean configured(){return settings.enabled()&&"TEST".equals(settings.mode())&&settings.apiKey().startsWith("sk_test_")&&settings.webhookSecret().startsWith("whsec_")&&settings.accountId().matches("acct_[A-Za-z0-9_]{1,120}");}
    @Override public String unavailableReason(){return configured()?null:"PAYMENT_NOT_CONFIGURED";}
    @Override public CreatedCheckout createCheckout(CheckoutParameters p,String key){
        ready();if(p==null||!supportsAmount(p.amountMinor(),p.currency())||key==null||key.length()>100)throw new PaymentGatewayException("PROVIDER_REQUEST_INVALID",false);
        try{
            var product=SessionCreateParams.LineItem.PriceData.ProductData.builder().setName(p.title()).putMetadata("offer_revision_id",p.offerRevisionId().toString()).build();
            var price=SessionCreateParams.LineItem.PriceData.builder().setCurrency(p.currency().toLowerCase(Locale.ROOT)).setUnitAmount(p.amountMinor()).setProductData(product).setTaxBehavior(SessionCreateParams.LineItem.PriceData.TaxBehavior.INCLUSIVE).build();
            var params=SessionCreateParams.builder().setMode(SessionCreateParams.Mode.PAYMENT).setUiMode(SessionCreateParams.UiMode.HOSTED_PAGE).setClientReferenceId(p.orderId().toString()).setSuccessUrl(p.successUrl()).setCancelUrl(p.cancelUrl()).setExpiresAt(p.expiresAt().getEpochSecond()).setLocale("fr".equals(p.locale())?SessionCreateParams.Locale.FR:SessionCreateParams.Locale.EN)
                .putMetadata("operation_id",p.operationId().toString()).putMetadata("order_id",p.orderId().toString())
                .setPaymentIntentData(SessionCreateParams.PaymentIntentData.builder().putMetadata("operation_id",p.operationId().toString()).putMetadata("order_id",p.orderId().toString()).build())
                .setAdaptivePricing(SessionCreateParams.AdaptivePricing.builder().setEnabled(false).build()).setAutomaticTax(SessionCreateParams.AutomaticTax.builder().setEnabled(false).build()).setAllowPromotionCodes(false)
                .addLineItem(SessionCreateParams.LineItem.builder().setQuantity(1L).setPriceData(price).build()).build();
            var session=client.v1().checkout().sessions().create(params,RequestOptions.builder().setIdempotencyKey(key).build());
            if(session.getId()==null||session.getLivemode()==null||session.getLivemode()||session.getExpiresAt()==null||session.getExpiresAt()!=p.expiresAt().getEpochSecond()||!validCheckoutUrl(session.getUrl()))throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);
            return new CreatedCheckout(session.getId(),session.getUrl(),Instant.ofEpochSecond(session.getExpiresAt()),session.getLivemode(),settings.accountId());
        }catch(StripeException failure){throw classify(failure);}catch(PaymentGatewayException failure){throw failure;}catch(RuntimeException failure){throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);}
    }
    @Override public CheckoutFacts retrieveCheckoutFacts(String sessionId){
        ready();if(sessionId==null||!sessionId.matches("cs_[A-Za-z0-9_]{1,250}"))throw new PaymentGatewayException("PROVIDER_REQUEST_INVALID",false);
        try{
            var session=client.v1().checkout().sessions().retrieve(sessionId,SessionRetrieveParams.builder().addExpand("payment_intent.latest_charge").build());
            var collection=client.v1().checkout().sessions().lineItems().list(sessionId,SessionLineItemListParams.builder().setLimit(2L).addExpand("data.price.product").build());
            if(Boolean.TRUE.equals(collection.getHasMore()))throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",false);
            var lines=new ArrayList<CheckoutLine>();
            for(var line:collection.getData()){
                var product=line.getPrice()==null?null:line.getPrice().getProductObject();
                if(product==null||product.getMetadata()==null||line.getAmountTotal()==null||line.getQuantity()==null)throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);
                lines.add(new CheckoutLine(product.getMetadata().get("offer_revision_id"),line.getAmountTotal(),upper(line.getCurrency()),line.getQuantity()));
            }
            var intent=session.getPaymentIntentObject();var charge=intent==null?null:intent.getLatestChargeObject();
            if(intent!=null&&"succeeded".equals(intent.getStatus())&&(charge==null||charge.getAmountRefunded()==null))throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);
            if(session.getMetadata()==null||session.getLivemode()==null||session.getExpiresAt()==null)throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);
            if(session.getUrl()!=null&&!validCheckoutUrl(session.getUrl()))throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);
            return new CheckoutFacts(session.getId(),uuid(session.getMetadata().get("operation_id")),uuid(session.getMetadata().get("order_id")),session.getClientReferenceId(),session.getLivemode(),settings.accountId(),StripeSettings.API_VERSION,session.getMode(),session.getStatus(),session.getPaymentStatus(),session.getPaymentIntent(),intent==null?null:intent.getStatus(),session.getAmountTotal(),intent==null?null:intent.getAmountReceived(),upper(session.getCurrency()),List.copyOf(lines),charge==null?0:charge.getAmountRefunded(),null,Instant.ofEpochSecond(session.getExpiresAt()),session.getUrl());
        }catch(StripeException failure){throw classify(failure);}catch(PaymentGatewayException failure){throw failure;}catch(RuntimeException failure){throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);}
    }
    @Override public Optional<CheckoutFacts> findCheckoutFacts(CheckoutParameters p){
        ready();String after=null;String matched=null;
        try{
            for(int page=0;page<3;page++){
                var builder=SessionListParams.builder().setLimit(100L).setCreated(SessionListParams.Created.builder().setGte(p.expiresAt().minusSeconds(3900).getEpochSecond()).build());if(after!=null)builder.setStartingAfter(after);
                var list=client.v1().checkout().sessions().list(builder.build());
                for(var session:list.getData())if(session.getMetadata()!=null&&p.operationId().toString().equals(session.getMetadata().get("operation_id"))&&p.orderId().toString().equals(session.getClientReferenceId())){if(matched!=null&&!matched.equals(session.getId()))throw new PaymentGatewayException("PROVIDER_DUPLICATE_SESSION",false);matched=session.getId();}
                if(!Boolean.TRUE.equals(list.getHasMore()))return matched==null?Optional.empty():Optional.of(retrieveCheckoutFacts(matched));
                if(list.getData().isEmpty())throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);after=list.getData().getLast().getId();
            }
            throw new PaymentGatewayException("PROVIDER_SEARCH_LIMIT",false);
        }catch(StripeException failure){throw classify(failure);}catch(PaymentGatewayException failure){throw failure;}catch(RuntimeException failure){throw new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);}
    }
    public static boolean validCheckoutUrl(String value){try{if(value==null||value.length()>4096)return false;var uri=URI.create(value);return "https".equals(uri.getScheme())&&"checkout.stripe.com".equals(uri.getHost())&&uri.getPort()==-1&&uri.getUserInfo()==null&&uri.getPath()!=null&&uri.getPath().startsWith("/c/pay/");}catch(RuntimeException invalid){return false;}}
    @Override public RefundFacts createRefund(RefundParameters p,String key){
        ready();if(p==null||p.operationId()==null||p.orderId()==null||p.paymentIntentId()==null||!p.paymentIntentId().matches("pi_[A-Za-z0-9_]{1,250}")||p.amountMinor()<1||p.amountMinor()>99_999_999||key==null||!key.equals("cc-refund-"+p.operationId()))throw new PaymentGatewayException("PROVIDER_REQUEST_INVALID",false);
        try{
            var intent=client.v1().paymentIntents().retrieve(p.paymentIntentId(),PaymentIntentRetrieveParams.builder().addExpand("latest_charge").build());
            if(!Boolean.FALSE.equals(intent.getLivemode())||!"succeeded".equals(intent.getStatus())||intent.getAmountReceived()==null||p.amountMinor()>intent.getAmountReceived()||!p.currency().equals(upper(intent.getCurrency())))throw new PaymentGatewayException("REFUND_PAYMENT_INVALID",false);
            var params=RefundCreateParams.builder().setPaymentIntent(p.paymentIntentId()).setAmount(p.amountMinor()).setReason(RefundCreateParams.Reason.REQUESTED_BY_CUSTOMER)
                .putMetadata("refund_operation_id",p.operationId().toString()).putMetadata("order_id",p.orderId().toString()).build();
            var refund=client.v1().refunds().create(params,RequestOptions.builder().setIdempotencyKey(key).build());
            var facts=refund(refund,p.paymentIntentId(),false);
            if(!p.operationId().equals(facts.operationId())||!p.orderId().equals(facts.orderId())||facts.amountMinor()!=p.amountMinor()||!p.currency().equals(facts.currency()))throw new PaymentGatewayException("REFUND_RESPONSE_INVALID",true);
            return facts;
        }catch(StripeException failure){throw classify(failure);}catch(PaymentGatewayException failure){throw failure;}catch(RuntimeException failure){throw new PaymentGatewayException("REFUND_RESPONSE_INVALID",true);}
    }
    @Override public RefundPaymentFacts retrieveRefunds(String paymentIntentId){
        ready();if(paymentIntentId==null||!paymentIntentId.matches("pi_[A-Za-z0-9_]{1,250}"))throw new PaymentGatewayException("PROVIDER_REQUEST_INVALID",false);
        try{
            var intent=client.v1().paymentIntents().retrieve(paymentIntentId,PaymentIntentRetrieveParams.builder().addExpand("latest_charge").build());var charge=intent.getLatestChargeObject();
            if(!Boolean.FALSE.equals(intent.getLivemode())||!"succeeded".equals(intent.getStatus())||intent.getAmountReceived()==null||charge==null||!Boolean.FALSE.equals(charge.getLivemode()))throw new PaymentGatewayException("REFUND_PAYMENT_INVALID",false);
            String after=null;var refunds=new ArrayList<RefundFacts>();
            for(int page=0;page<3;page++){
                var builder=RefundListParams.builder().setPaymentIntent(paymentIntentId).setLimit(100L);if(after!=null)builder.setStartingAfter(after);
                var collection=client.v1().refunds().list(builder.build());
                for(var row:collection.getData()){var fact=refund(row,paymentIntentId,false);if(!charge.getId().equals(fact.chargeId()))throw new PaymentGatewayException("REFUND_PAYMENT_INVALID",false);refunds.add(fact);}
                if(!Boolean.TRUE.equals(collection.getHasMore()))return new RefundPaymentFacts(paymentIntentId,charge.getId(),intent.getAmountReceived(),upper(intent.getCurrency()),false,settings.accountId(),refunds,true);
                if(collection.getData().isEmpty())throw new PaymentGatewayException("REFUND_RESPONSE_INVALID",true);after=collection.getData().getLast().getId();
            }
            throw new PaymentGatewayException("REFUND_SEARCH_LIMIT",false);
        }catch(StripeException failure){throw classify(failure);}catch(PaymentGatewayException failure){throw failure;}catch(RuntimeException failure){throw new PaymentGatewayException("REFUND_RESPONSE_INVALID",true);}
    }
    @Override public RefundPaymentFacts retrieveRefundPayment(String objectId,String eventType){
        ready();try{
            String payment;
            if(objectId!=null&&objectId.matches("re_[A-Za-z0-9_]{1,250}")){var r=client.v1().refunds().retrieve(objectId);payment=r.getPaymentIntent();if(payment==null&&r.getCharge()!=null)payment=client.v1().charges().retrieve(r.getCharge()).getPaymentIntent();}
            else if(objectId!=null&&objectId.matches("ch_[A-Za-z0-9_]{1,250}")){var charge=client.v1().charges().retrieve(objectId);if(!Boolean.FALSE.equals(charge.getLivemode()))throw new PaymentGatewayException("REFUND_PAYMENT_INVALID",false);payment=charge.getPaymentIntent();}
            else throw new PaymentGatewayException("PROVIDER_REQUEST_INVALID",false);
            return retrieveRefunds(payment);
        }catch(StripeException failure){throw classify(failure);}catch(PaymentGatewayException failure){throw failure;}catch(RuntimeException failure){throw new PaymentGatewayException("REFUND_RESPONSE_INVALID",true);}
    }
    private RefundFacts refund(com.stripe.model.Refund r,String payment,boolean live){
        if(r==null||r.getId()==null||!r.getId().matches("re_[A-Za-z0-9_]{1,250}")||r.getPaymentIntent()==null||!payment.equals(r.getPaymentIntent())||r.getAmount()==null||r.getAmount()<1||r.getAmount()>99_999_999||r.getCreated()==null||!java.util.Set.of("pending","requires_action","succeeded","failed","canceled").contains(r.getStatus()))throw new PaymentGatewayException("REFUND_RESPONSE_INVALID",true);
        var metadata=r.getMetadata();String failure=r.getFailureReason();if(failure!=null&&!failure.matches("[a-z_]{1,64}"))failure="unknown";
        return new RefundFacts(r.getId(),payment,r.getCharge(),optionalUuid(metadata==null?null:metadata.get("refund_operation_id")),optionalUuid(metadata==null?null:metadata.get("order_id")),r.getAmount(),upper(r.getCurrency()),r.getStatus(),live,settings.accountId(),Instant.ofEpochSecond(r.getCreated()),failure);
    }
    private static UUID optionalUuid(String value){if(value==null||!value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"))return null;try{return UUID.fromString(value);}catch(IllegalArgumentException invalid){return null;}}
    private void ready(){
        if(!configured())throw new PaymentGatewayException("PAYMENT_NOT_CONFIGURED",false);
        if(accountVerified)return;
        // One merchant, no Connect impersonation. The immutable client/key is verified once per instance.
        synchronized(this){if(accountVerified)return;try{
            var account=client.v1().accounts().retrieveCurrent();
            if(account==null||!settings.accountId().equals(account.getId()))throw new PaymentGatewayException("PROVIDER_ACCOUNT_MISMATCH",false);
            accountVerified=true;
        }catch(StripeException failure){throw classify(failure);}}
    }
    private static String upper(String value){return value==null?null:value.toUpperCase(Locale.ROOT);}
    private static UUID uuid(String value){try{return UUID.fromString(value);}catch(RuntimeException invalid){throw new PaymentGatewayException("PROVIDER_REFERENCE_INVALID",false);}}
    private static PaymentGatewayException classify(StripeException failure){Integer status=failure.getStatusCode();return new PaymentGatewayException(failure instanceof ApiConnectionException?"PROVIDER_TRANSPORT_UNKNOWN":status!=null&&status==429?"PROVIDER_RATE_LIMITED":"PROVIDER_REQUEST_FAILED",failure instanceof ApiConnectionException||status==null||status>=500||status==409);}
}
