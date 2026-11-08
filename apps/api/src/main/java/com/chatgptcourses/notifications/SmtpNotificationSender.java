package com.chatgptcourses.notifications;

import com.chatgptcourses.notifications.NotificationTypes.Payload;
import com.chatgptcourses.notifications.NotificationTypes.Type;
import com.chatgptcourses.shared.config.RuntimeProperties;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
class SmtpNotificationSender implements NotificationSender {
    private final PasswordResetNotifier reset;
    private final JavaMailSender mail;
    private final NotificationSettings settings;
    private final RuntimeProperties runtime;
    private final String host;
    SmtpNotificationSender(PasswordResetNotifier reset,JavaMailSender mail,NotificationSettings settings,RuntimeProperties runtime,@Value("${spring.mail.host}")String host){this.reset=reset;this.mail=mail;this.settings=settings;this.runtime=runtime;this.host=host;}
    @Override public void send(UUID id,Type type,Payload payload){
        if("disabled".equals(settings.mailMode()))throw new IllegalStateException("Notification transport disabled");
        if(type==Type.PASSWORD_RESET){reset.send(payload.recipient(),payload.locale(),payload.token(),payload.tokenExpiresAt());return;}
        boolean local="local".equals(settings.mailMode()),en="en".equals(payload.locale());
        if(local&&(!Set.of("local","test").contains(runtime.environment())||!Set.of("localhost","127.0.0.1","::1").contains(host)))throw new IllegalStateException("Local notification target unavailable");
        String from=settings.mailFrom();if(from==null||from.isBlank()){if(!local)throw new IllegalStateException("MAIL_FROM is required for SMTP delivery");from="noreply@courses.local.invalid";}
        String subject,body;
        switch(type){
            case ACCOUNT_CREATED->{subject=en?"Your ChatGPT Courses account was created":"Votre compte ChatGPT Courses a été créé";body=en?"Your account has been created. This message confirms registration; it does not verify ownership of this email address.":"Votre compte a été créé. Ce message confirme l’inscription ; il ne vérifie pas la propriété de cette adresse email.";}
            case ACCESS_ACTIVATED->{subject=en?"Your learning access was updated":"Vos accès de formation ont été actualisés";body=(en?"Access was activated for: ":"Un accès a été activé pour : ")+payload.resourceTitle();}
            case SUPPORT_REPLY->{subject=en?"A support update is available":"Une réponse du support est disponible";body=en?"A support update is available in your account. No private conversation is included in this email.":"Une réponse du support est disponible dans votre compte. Cet email ne contient pas le contenu de la conversation privée.";}
            case REFUND_UPDATED->{subject=en?"Your refund case was updated":"Votre dossier de remboursement a été actualisé";body=en?"Your refund case has been updated. Consult your account for the financial status and access effects. This message does not confirm receipt by your bank.":"Votre dossier de remboursement a été actualisé. Consultez votre compte pour le statut financier et les effets sur vos accès. Ce message ne confirme pas la réception par votre banque.";}
            default->throw new IllegalStateException("Unsupported notification type");
        }
        String link=runtime.publicOrigin().toASCIIString()+(en?"/en/account":"/fr/compte");
        var message=new SimpleMailMessage();message.setFrom(from);message.setTo(payload.recipient());message.setSubject(subject);message.setText(body+"\n\n"+link);mail.send(message);
    }
}
